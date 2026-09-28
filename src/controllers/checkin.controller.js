const jwt = require('jsonwebtoken');
const env = require('../config/env');
const dailyCodeService = require('../services/dailyCode.service');
const attendanceService = require('../services/attendance.service');
const db = require('../config/db');
const { horaLima, hoyLima, primerDiaMesLima } = require('../utils/limaDate');
const horarioService = require('../services/horario.service');
const { clasificarEntrada, clasificarSalida } = require('../utils/overtime');
const { calcularDistanciaMetros } = require('../utils/geo');
const intentosService = require('../services/intentos.service');

const DEVICE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 365 // 1 año
};

function setDeviceCookie(res, workerId, empresaId) {
  const token = jwt.sign({ workerId, empresaId }, env.jwtSecret, { expiresIn: '365d' });
  res.cookie('worker_token', token, DEVICE_COOKIE_OPTS);
}

// Si se pasa empresaId, solo reconoce al trabajador cuando la cookie es de
// ESA empresa (la del QR que se acaba de escanear). Esto es lo que permite
// que un mismo celular marque asistencia en dos negocios distintos sin
// mezclar los datos: si la cookie es de otra empresa, se trata como "sin
// identificar" y se vuelve a pedir nombre+DNI (creando/encontrando el
// registro correcto dentro de la empresa nueva). Sin empresaId (usado por
// /mi-historial) simplemente reconoce lo que haya en la cookie.
async function workerDesdeCookie(req, empresaId) {
  const token = req.cookies?.worker_token;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (empresaId !== undefined && payload.empresaId !== empresaId) return null;

    const worker = await db('workers')
      .where({ id: payload.workerId, empresa_id: payload.empresaId, activo: true })
      .first();
    return worker || null;
  } catch (err) {
    return null;
  }
}

async function datosParaVistaMarcar(worker, codigo, registro, error) {
  const geo = await horarioService.obtenerConfigUbicacion(codigo.sucursal_id);
  const { count } = await db('sucursales')
    .where({ empresa_id: codigo.empresa_id, activo: true })
    .count('* as count')
    .first();
  const empresa = await db('empresas').where({ id: codigo.empresa_id }).first('controla_refrigerio');
  return {
    token: codigo.token,
    nombre: worker.nombre,
    logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
    horaEntrada: registro ? horaLima(new Date(registro.creado_en)) : null,
    horaSalida: registro?.hora_salida ? horaLima(new Date(registro.hora_salida)) : null,
    geolocalizacionActiva: geo.activa,
    radioMetros: geo.radioMetros,
    controlaRefrigerio: Boolean(empresa?.controla_refrigerio),
    horaRefrigerioSalida: registro?.refrigerio_salida_en
      ? horaLima(new Date(registro.refrigerio_salida_en))
      : null,
    horaRefrigerioRegreso: registro?.refrigerio_regreso_en
      ? horaLima(new Date(registro.refrigerio_regreso_en))
      : null,
    sucursalNombre: Number(count) > 1 ? geo.nombre : null,
    error: error || null
  };
}

// Maximo margen de error del GPS (metros) que se descuenta de la distancia.
// Asi una lectura muy imprecisa no habilita a marcar desde lejos.
const TOPE_MARGEN_GPS_M = 50;

// Valida la ubicacion enviada al marcar contra la de la sucursal del QR
// escaneado (si tiene la verificacion activa). Devuelve { ok:true, geo } con
// lat/lng/distancia/precision lista para persistir, o { ok:false, mensaje,
// motivo, distanciaMetros?, precisionMetros? } sin tocar la base de datos.
// Se acepta si distancia - min(precision, TOPE) <= radio: el celular reporta
// su margen de error y dentro de edificios suele ser de 30-80 m.
async function validarGeolocalizacion(sucursalId, body) {
  const config = await horarioService.obtenerConfigUbicacion(sucursalId);
  if (!config.activa) {
    return { ok: true, geo: null };
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat === undefined || body.lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      motivo: 'sin_ubicacion',
      mensaje: 'No pudimos verificar tu ubicación. Activa el permiso de ubicación en tu navegador e intenta de nuevo.'
    };
  }

  const precision = intentosService.numeroONull(body.precision);
  const precisionMetros = precision !== null && precision >= 0 ? Math.round(precision * 100) / 100 : null;
  const distanciaMetros = calcularDistanciaMetros(config.lat, config.lng, lat, lng);
  const margen = precisionMetros === null ? 0 : Math.min(precisionMetros, TOPE_MARGEN_GPS_M);

  if (distanciaMetros - margen > config.radioMetros) {
    const detallePrecision = precisionMetros === null ? '' : ` (precisión ±${Math.round(precisionMetros)}m)`;
    return {
      ok: false,
      motivo: 'fuera_de_rango',
      distanciaMetros,
      precisionMetros,
      mensaje: `Estás fuera del rango permitido para marcar asistencia: a ${Math.round(distanciaMetros)}m${detallePrecision}, máximo ${config.radioMetros}m. Si estás dentro del local, acércate a una ventana o a la puerta, activa el Wi-Fi y vuelve a intentar.`
    };
  }

  return {
    ok: true,
    geo: { lat, lng, distanciaMetros: Math.round(distanciaMetros * 100) / 100, precisionMetros }
  };
}

async function mostrarCheckin(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const worker = await workerDesdeCookie(req, codigo.empresa_id);
  if (!worker) {
    return res.render('checkin/form', { token, logoEmpresaUrl: `/logo/${codigo.empresa_id}` });
  }

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render(
    'checkin/marcar',
    await datosParaVistaMarcar(worker, codigo, registro)
  );
}

async function identificar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const logoEmpresaUrl = `/logo/${codigo.empresa_id}`;
  const dni = String(req.body.dni || '').trim();
  const nombre = String(req.body.nombre || '').trim();

  if (!/^\d{8}$/.test(dni)) {
    return res.render('checkin/form', {
      token,
      logoEmpresaUrl,
      error: 'Ingresa un DNI valido de 8 digitos'
    });
  }
  if (nombre.length < 3) {
    return res.render('checkin/form', { token, logoEmpresaUrl, error: 'Ingresa tu nombre completo' });
  }

  const worker = await attendanceService.buscarOCrearWorker({
    dni,
    nombre,
    empresaId: codigo.empresa_id
  });
  if (!worker.activo) {
    return res.render('checkin/form', {
      token,
      logoEmpresaUrl,
      error: 'Tu registro esta inactivo. Contacta al administrador.'
    });
  }

  // Reclama el DNI para este dispositivo (update atomico condicional a
  // dispositivo_vinculado=false). Si ya estaba vinculado a otro dispositivo,
  // esto falla y se corta el flujo aca mismo.
  const gano = await attendanceService.vincularDispositivo(worker.id);
  if (!gano) {
    return res.render('checkin/form', {
      token,
      logoEmpresaUrl,
      error:
        'Este DNI ya está vinculado a un dispositivo. Si cambiaste de celular, pide al administrador que reinicie el vínculo.'
    });
  }

  setDeviceCookie(res, worker.id, codigo.empresa_id);

  const registro = await attendanceService.buscarAsistenciaDeHoy(worker.id);
  return res.render(
    'checkin/marcar',
    await datosParaVistaMarcar(worker, codigo, registro)
  );
}

async function marcar(req, res) {
  const { token } = req.params;
  const codigo = await dailyCodeService.validarToken(token);
  if (!codigo) {
    return res.render('checkin/codigo-invalido');
  }

  const worker = await workerDesdeCookie(req, codigo.empresa_id);
  if (!worker) {
    return res.render('checkin/form', { token, logoEmpresaUrl: `/logo/${codigo.empresa_id}` });
  }

  const accion = req.body.accion;

  const geoResultado = await validarGeolocalizacion(codigo.sucursal_id, req.body);
  if (!geoResultado.ok) {
    await intentosService.registrar({
      empresaId: codigo.empresa_id,
      sucursalId: codigo.sucursal_id,
      workerId: worker.id,
      accion,
      motivo: geoResultado.motivo,
      distanciaMetros: geoResultado.distanciaMetros,
      precisionMetros: geoResultado.precisionMetros,
      userAgent: req.get('user-agent')
    });
    const registroActual = await attendanceService.buscarAsistenciaDeHoy(worker.id);
    return res.render(
      'checkin/marcar',
      await datosParaVistaMarcar(worker, codigo, registroActual, geoResultado.mensaje)
    );
  }

  if (accion === 'entrada') {
    const { registro, yaExistia } = await attendanceService.marcarEntrada({
      workerId: worker.id,
      dailyCodeId: codigo.id,
      empresaId: codigo.empresa_id,
      sucursalId: codigo.sucursal_id,
      geo: geoResultado.geo
    });
    const horario = await horarioService.resolverHorarioDelDia(worker.id, registro.fecha);
    const tolerancia = await horarioService.obtenerToleranciaEmpresa(codigo.empresa_id);
    const clasificacion = clasificarEntrada({
      horaReal: registro.creado_en,
      horario,
      toleranciaMinutos: tolerancia
    });
    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
      tipo: 'entrada',
      hora: horaLima(new Date(registro.creado_en)),
      estadoMarcacion: clasificacion.estado,
      minutosMarcacion: clasificacion.minutos,
      yaExistia
    });
  }

  if (accion === 'salida') {
    const resultado = await attendanceService.marcarSalida({ workerId: worker.id, geo: geoResultado.geo });

    if (resultado.error === 'sin_entrada') {
      return res.render(
        'checkin/marcar',
        await datosParaVistaMarcar(worker, codigo, null, 'Primero marca tu entrada de hoy.')
      );
    }

    const horario = await horarioService.resolverHorarioDelDia(worker.id, resultado.registro.fecha);
    const clasificacion = clasificarSalida({ horaReal: resultado.registro.hora_salida, horario });
    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
      tipo: 'salida',
      hora: horaLima(new Date(resultado.registro.hora_salida)),
      estadoMarcacion: clasificacion.estado,
      minutosMarcacion: clasificacion.minutos,
      yaExistia: resultado.yaExistia
    });
  }

  if (accion === 'refrigerio_salida' || accion === 'refrigerio_regreso') {
    const empresa = await db('empresas').where({ id: codigo.empresa_id }).first('controla_refrigerio');
    const registroActual = await attendanceService.buscarAsistenciaDeHoy(worker.id);
    if (!empresa?.controla_refrigerio) {
      return res.render(
        'checkin/marcar',
        await datosParaVistaMarcar(worker, codigo, registroActual, 'Tu empresa no controla el refrigerio.')
      );
    }

    const esSalida = accion === 'refrigerio_salida';
    const resultado = esSalida
      ? await attendanceService.marcarRefrigerioSalida({ workerId: worker.id })
      : await attendanceService.marcarRefrigerioRegreso({ workerId: worker.id });

    const mensajesError = {
      sin_entrada: 'Primero marca tu entrada de hoy.',
      jornada_cerrada: 'Ya marcaste tu salida de hoy.',
      sin_salida_refrigerio: 'Primero marca tu salida a refrigerio.'
    };
    if (resultado.error) {
      return res.render(
        'checkin/marcar',
        await datosParaVistaMarcar(worker, codigo, registroActual, mensajesError[resultado.error])
      );
    }

    const hora = esSalida
      ? resultado.registro.refrigerio_salida_en
      : resultado.registro.refrigerio_regreso_en;
    return res.render('checkin/confirmado', {
      nombre: worker.nombre,
      logoEmpresaUrl: `/logo/${codigo.empresa_id}`,
      tipo: esSalida ? 'salida a refrigerio' : 'regreso de refrigerio',
      hora: horaLima(new Date(hora)),
      estadoMarcacion: null,
      minutosMarcacion: null,
      yaExistia: resultado.yaExistia
    });
  }

  return res.status(400).send('Accion invalida');
}

// El navegador del trabajador reporta que no pudo obtener la ubicacion
// (permiso denegado, sin senal, tiempo agotado). Solo sirve para diagnostico
// en Configuracion; no afecta ninguna marcacion.
const MOTIVOS_DEL_NAVEGADOR = ['sin_permiso', 'sin_senal', 'tiempo_agotado', 'navegador_sin_soporte'];

async function registrarIntentoFallido(req, res) {
  const codigo = await dailyCodeService.validarToken(req.params.token);
  if (!codigo) return res.status(204).end();

  const worker = await workerDesdeCookie(req, codigo.empresa_id);
  const motivo = String(req.body?.motivo || '');
  if (!worker || !MOTIVOS_DEL_NAVEGADOR.includes(motivo)) return res.status(204).end();

  await intentosService.registrar({
    empresaId: codigo.empresa_id,
    sucursalId: codigo.sucursal_id,
    workerId: worker.id,
    accion: req.body?.accion,
    motivo,
    precisionMetros: req.body?.precision,
    userAgent: req.get('user-agent')
  });
  return res.status(204).end();
}

async function historialWorker(req, res) {
  const worker = await workerDesdeCookie(req);
  if (!worker) {
    return res.render('checkin/sin-identificar');
  }

  const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  let desde = req.query.desde;
  let hasta = req.query.hasta;
  if (!desde || !hasta || !FECHA_REGEX.test(desde) || !FECHA_REGEX.test(hasta) || desde > hasta) {
    desde = primerDiaMesLima();
    hasta = hoyLima();
  }

  const registrosCrudos = await attendanceService.listarHistorialDeWorker({
    workerId: worker.id,
    desde,
    hasta
  });
  const tolerancia = await horarioService.obtenerToleranciaEmpresa(worker.empresa_id);
  const registros = await horarioService.decorarConHorario(registrosCrudos, tolerancia);

  let totalAprobado25 = 0;
  let totalAprobado35 = 0;
  let diasTarde = 0;
  let minutosAcumulados = 0;
  for (const r of registros) {
    if (r.horas_extra_estado === 'aprobado') {
      totalAprobado25 += Number(r.horas_extra_25);
      totalAprobado35 += Number(r.horas_extra_35);
    }
    if (r.entrada_estado === 'tarde') {
      diasTarde += 1;
      minutosAcumulados += r.entrada_minutos || 0;
    }
  }

  return res.render('checkin/mi-historial', {
    nombre: worker.nombre,
    logoEmpresaUrl: `/logo/${worker.empresa_id}`,
    desde,
    hasta,
    totalAprobado25: totalAprobado25.toFixed(2),
    totalAprobado35: totalAprobado35.toFixed(2),
    diasTarde,
    minutosAcumulados,
    registros: registros.map((r) => ({
      fecha: new Date(r.fecha).toISOString().slice(0, 10),
      horaEntrada: horaLima(new Date(r.creado_en)),
      horaSalida: r.hora_salida ? horaLima(new Date(r.hora_salida)) : '—',
      horasPendientes: r.horas_pendientes,
      entradaEstado: r.entrada_estado,
      entradaMinutos: r.entrada_minutos,
      salidaEstado: r.salida_estado,
      salidaMinutos: r.salida_minutos,
      horasExtra25: Number(r.horas_extra_25),
      horasExtra35: Number(r.horas_extra_35),
      estado: r.horas_extra_estado
    }))
  });
}

module.exports = { mostrarCheckin, identificar, marcar, registrarIntentoFallido, historialWorker };
