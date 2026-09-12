const dailyCodeService = require('../services/dailyCode.service');
const qrImageService = require('../services/qrImage.service');
const attendanceService = require('../services/attendance.service');
const horarioService = require('../services/horario.service');
const db = require('../config/db');
const { hoyLima, limaLocalInputToDate } = require('../utils/limaDate');

const ESTADOS_HORAS_EXTRA = ['pendiente', 'aprobado', 'rechazado'];
const HORA_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// "fecha" es una columna DATE (sin hora); Postgres la sirve como medianoche
// UTC. Se extrae la parte de fecha tal cual, sin reinterpretarla en ningun
// huso horario (eso la correria al dia anterior).
function formatoFecha(valor) {
  return new Date(valor).toISOString().slice(0, 10);
}

async function workerDeEmpresa(workerId, empresaId) {
  return db('workers').where({ id: workerId, empresa_id: empresaId }).first();
}

async function nombreDeEmpresa(empresaId) {
  const empresa = await db('empresas').where({ id: empresaId }).first('nombre');
  return empresa?.nombre || '';
}

async function subirLogo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  await db('empresas')
    .where({ id: req.admin.empresaId })
    .update({ logo_data: req.file.buffer, logo_mime: req.file.mimetype });

  res.json({ url: `/logo/${req.admin.empresaId}?v=${Date.now()}` });
}

async function obtenerConfiguracionEmpresa(req, res) {
  const empresa = await db('empresas').where({ id: req.admin.empresaId }).first();
  res.json({
    toleranciaEntradaMinutos: empresa.tolerancia_entrada_minutos,
    direccion: empresa.direccion || '',
    lat: empresa.lat != null ? Number(empresa.lat) : null,
    lng: empresa.lng != null ? Number(empresa.lng) : null,
    radioMetros: empresa.radio_metros,
    geolocalizacionActiva: empresa.geolocalizacion_activa
  });
}

// Un unico endpoint de configuracion que acepta actualizaciones parciales:
// el admin guarda la tolerancia y la ubicacion desde tarjetas separadas en la
// pantalla, cada una con su propio boton, pero ambas pegan aca — solo se
// valida/actualiza lo que venga presente en el body.
async function guardarConfiguracionEmpresa(req, res) {
  const { toleranciaEntradaMinutos, direccion, lat, lng, radioMetros, geolocalizacionActiva } =
    req.body;
  const cambios = {};

  if (toleranciaEntradaMinutos !== undefined) {
    const minutos = Number(toleranciaEntradaMinutos);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > 120) {
      return res.status(400).json({ error: 'La tolerancia debe ser un entero entre 0 y 120 minutos' });
    }
    cambios.tolerancia_entrada_minutos = minutos;
  }

  if (radioMetros !== undefined || lat !== undefined || lng !== undefined || geolocalizacionActiva !== undefined) {
    const radio = Number(radioMetros);
    if (!Number.isInteger(radio) || radio < 10 || radio > 500) {
      return res.status(400).json({ error: 'El radio debe ser un entero entre 10 y 500 metros' });
    }

    const latNum = lat === '' || lat === null || lat === undefined ? null : Number(lat);
    const lngNum = lng === '' || lng === null || lng === undefined ? null : Number(lng);
    if (
      (latNum !== null && (!Number.isFinite(latNum) || latNum < -90 || latNum > 90)) ||
      (lngNum !== null && (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180))
    ) {
      return res.status(400).json({ error: 'Coordenadas invalidas' });
    }

    const activa = Boolean(geolocalizacionActiva);
    if (activa && (latNum === null || lngNum === null)) {
      return res.status(400).json({
        error: 'Guarda una ubicacion (usa "Usar mi ubicacion actual") antes de activar la verificacion'
      });
    }

    cambios.direccion = direccion ? String(direccion).slice(0, 500) : null;
    cambios.lat = latNum;
    cambios.lng = lngNum;
    cambios.radio_metros = radio;
    cambios.geolocalizacion_activa = activa;
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'Nada que guardar' });
  }

  await db('empresas').where({ id: req.admin.empresaId }).update(cambios);
  return obtenerConfiguracionEmpresa(req, res);
}

async function servirLogo(req, res) {
  const { empresaId } = req.params;
  const empresa = await db('empresas').where({ id: empresaId }).first();
  if (!empresa || !empresa.logo_data) {
    return res.status(404).send('Sin logo');
  }
  res.set('Content-Type', empresa.logo_mime);
  res.set('Cache-Control', 'public, max-age=300');
  res.send(empresa.logo_data);
}

function paginaLogin(req, res) {
  res.render('admin/login');
}

async function paginaDashboard(req, res) {
  res.render('admin/dashboard', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function paginaHistorial(req, res) {
  res.render('admin/historial', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function paginaTrabajadores(req, res) {
  res.render('admin/trabajadores', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function paginaHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).send('Trabajador no encontrado');
  }
  res.render('admin/horario-trabajador', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`,
    worker
  });
}

async function paginaTurnos(req, res) {
  res.render('admin/turnos', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function paginaConfiguracion(req, res) {
  res.render('admin/configuracion', {
    admin: req.admin,
    empresaNombre: await nombreDeEmpresa(req.admin.empresaId),
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`
  });
}

async function qrDeHoy(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId);
  res.json({
    fecha: formatoFecha(codigo.fecha),
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function qrDeHoyImagen(req, res) {
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId);
  const buffer = await qrImageService.generarPngBuffer(codigo.token);
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(buffer);
}

async function regenerarQr(req, res) {
  const codigo = await dailyCodeService.regenerarCodigoDeHoy(req.admin.empresaId, req.admin.id);
  res.json({
    fecha: formatoFecha(codigo.fecha),
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token)
  });
}

async function asistenciaDeHoy(req, res) {
  const registros = await attendanceService.listarAsistenciaDeHoy(req.admin.empresaId);
  res.json(registros);
}

function parametrosRango(query) {
  const hoy = hoyLima();
  const desde = query.desde || query.fecha || hoy;
  const hasta = query.hasta || query.fecha || hoy;
  const workerId = query.worker_id || null;

  if (!FECHA_REGEX.test(desde) || !FECHA_REGEX.test(hasta)) {
    return { error: 'Formato de fecha invalido, usa YYYY-MM-DD' };
  }
  if (desde > hasta) {
    return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  }
  return { desde, hasta, workerId };
}

async function asistenciaPorFecha(req, res) {
  const rango = parametrosRango(req.query);
  if (rango.error) {
    return res.status(400).json({ error: rango.error });
  }
  const registros = await attendanceService.listarAsistencia({
    empresaId: req.admin.empresaId,
    ...rango
  });

  const tolerancia = await horarioService.obtenerToleranciaEmpresa(req.admin.empresaId);
  res.json(await horarioService.decorarConHorario(registros, tolerancia));
}

async function exportarCsv(req, res) {
  const rango = parametrosRango(req.query);
  if (rango.error) {
    return res.status(400).json({ error: rango.error });
  }
  const { desde, hasta } = rango;

  const registros = await attendanceService.listarAsistencia({
    empresaId: req.admin.empresaId,
    ...rango
  });

  const formatoHora = (valor) =>
    valor
      ? new Intl.DateTimeFormat('es-PE', {
          timeZone: 'America/Lima',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }).format(new Date(valor))
      : '';

  const filas = [
    [
      'DNI',
      'Nombre',
      'Fecha',
      'Hora entrada (Lima)',
      'Hora salida (Lima)',
      'Horas extra 25%',
      'Horas extra 35%',
      'Estado horas extra',
      'Distancia entrada (m)'
    ]
  ];
  for (const r of registros) {
    filas.push([
      r.dni,
      r.nombre,
      formatoFecha(r.fecha),
      formatoHora(r.creado_en),
      formatoHora(r.hora_salida),
      r.horas_extra_25,
      r.horas_extra_35,
      r.horas_extra_estado,
      r.entrada_distancia_m === null || r.entrada_distancia_m === undefined ? '' : r.entrada_distancia_m
    ]);
  }

  const csv = filas
    .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const nombreArchivo = desde === hasta ? desde : `${desde}_a_${hasta}`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="asistencia_${nombreArchivo}.csv"`);
  res.send('﻿' + csv); // BOM para que Excel reconozca UTF-8
}

async function listarWorkers(req, res) {
  const workers = await db('workers')
    .where({ empresa_id: req.admin.empresaId })
    .orderBy('nombre', 'asc');
  res.json(workers);
}

async function actualizarWorker(req, res) {
  const { id } = req.params;
  const { activo, nombre, horas_extra_activas } = req.body;

  const cambios = {};
  if (typeof activo === 'boolean') cambios.activo = activo;
  if (typeof horas_extra_activas === 'boolean') cambios.horas_extra_activas = horas_extra_activas;
  if (typeof nombre === 'string' && nombre.trim()) cambios.nombre = nombre.trim();

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  // El filtro por empresa_id evita que un admin edite (o detecte la
  // existencia de) un trabajador de otra empresa adivinando el id.
  const [actualizado] = await db('workers')
    .where({ id, empresa_id: req.admin.empresaId })
    .update(cambios)
    .returning('*');
  if (!actualizado) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(actualizado);
}

async function editarAsistencia(req, res) {
  const { id } = req.params;
  const { hora_entrada, hora_salida } = req.body;

  const horaEntrada = hora_entrada ? limaLocalInputToDate(hora_entrada) : null;
  const horaSalida = hora_salida ? limaLocalInputToDate(hora_salida) : null;

  if ((hora_entrada && isNaN(horaEntrada)) || (hora_salida && isNaN(horaSalida))) {
    return res.status(400).json({ error: 'Fecha/hora invalida' });
  }

  const actualizado = await attendanceService.editarRegistro(
    id,
    { horaEntrada, horaSalida },
    req.admin.id,
    req.admin.empresaId
  );
  if (!actualizado) {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  res.json(actualizado);
}

async function cambiarEstadoHorasExtra(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS_HORAS_EXTRA.includes(estado) || estado === 'pendiente') {
    return res.status(400).json({ error: 'Estado invalido, usa "aprobado" o "rechazado"' });
  }

  const actualizado = await attendanceService.cambiarEstadoHorasExtra(
    id,
    estado,
    req.admin.id,
    req.admin.empresaId
  );
  if (!actualizado) {
    return res.status(404).json({ error: 'Registro no encontrado' });
  }
  res.json(actualizado);
}

// ---- Horario del trabajador (semanal o rotativo) ----

async function obtenerHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(await horarioService.obtenerHorarioDeWorker(worker.id));
}

async function validarPlantillasDeEmpresa(ids, empresaId) {
  if (ids.length === 0) return true;
  const filas = await db('plantillas_turno')
    .where({ empresa_id: empresaId })
    .whereIn('id', ids);
  return filas.length === new Set(ids).size;
}

async function guardarHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const { tipo, semanal, rotacion } = req.body;

  if (tipo === null) {
    await horarioService.quitarHorario(worker.id);
    return res.json(await horarioService.obtenerHorarioDeWorker(worker.id));
  }

  if (tipo === 'semanal') {
    if (!Array.isArray(semanal) || semanal.length !== 7) {
      return res.status(400).json({ error: 'Se requieren los 7 dias de la semana' });
    }
    const dias = new Set(semanal.map((d) => d.diaSemana));
    if (dias.size !== 7 || [...dias].some((d) => d < 0 || d > 6)) {
      return res.status(400).json({ error: 'Dias de la semana invalidos o repetidos' });
    }
    for (const d of semanal) {
      if (!d.libre) {
        if (!HORA_REGEX.test(d.horaEntrada || '') || !HORA_REGEX.test(d.horaSalida || '')) {
          return res.status(400).json({ error: 'Hora invalida, usa HH:MM' });
        }
      }
    }
    await horarioService.guardarHorarioSemanal(worker.id, semanal);
    return res.json(await horarioService.obtenerHorarioDeWorker(worker.id));
  }

  if (tipo === 'rotativo') {
    if (!rotacion || !FECHA_REGEX.test(rotacion.fechaAncla)) {
      return res.status(400).json({ error: 'Fecha ancla invalida' });
    }
    if (!Array.isArray(rotacion.pasos) || rotacion.pasos.length === 0) {
      return res.status(400).json({ error: 'La rotacion necesita al menos un paso' });
    }
    const idsValidos = await validarPlantillasDeEmpresa(rotacion.pasos, req.admin.empresaId);
    if (!idsValidos) {
      return res.status(400).json({ error: 'Alguna plantilla de turno no existe' });
    }
    await horarioService.guardarRotacion(worker.id, rotacion.fechaAncla, rotacion.pasos);
    return res.json(await horarioService.obtenerHorarioDeWorker(worker.id));
  }

  return res.status(400).json({ error: 'Tipo de horario invalido' });
}

// ---- Plantillas de turno ----

async function listarTurnos(req, res) {
  res.json(await horarioService.listarPlantillas(req.admin.empresaId));
}

async function crearTurno(req, res) {
  const { nombre, horaEntrada, horaSalida, cruzaMedianoche, esDescanso } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es requerido' });
  }
  if (!esDescanso && (!HORA_REGEX.test(horaEntrada || '') || !HORA_REGEX.test(horaSalida || ''))) {
    return res.status(400).json({ error: 'Hora invalida, usa HH:MM' });
  }
  try {
    const creada = await horarioService.crearPlantilla(req.admin.empresaId, {
      nombre: nombre.trim(),
      horaEntrada,
      horaSalida,
      cruzaMedianoche,
      esDescanso
    });
    res.status(201).json(creada);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un turno con ese nombre' });
    }
    throw err;
  }
}

async function actualizarTurno(req, res) {
  const actualizada = await horarioService.actualizarPlantilla(
    req.params.id,
    req.admin.empresaId,
    req.body
  );
  if (!actualizada) {
    return res.status(404).json({ error: 'Turno no encontrado' });
  }
  res.json(actualizada);
}

async function eliminarTurno(req, res) {
  try {
    const borrados = await horarioService.eliminarPlantilla(req.params.id, req.admin.empresaId);
    if (!borrados) {
      return res.status(404).json({ error: 'Turno no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res
        .status(409)
        .json({ error: 'Este turno esta en uso en una rotacion o excepcion, no se puede eliminar' });
    }
    throw err;
  }
}

// ---- Excepciones puntuales ----

async function listarExcepcionesTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(await horarioService.listarExcepciones(worker.id));
}

async function crearExcepcionTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const { fecha, libre, plantillaId, horaEntrada, horaSalida, motivo } = req.body;
  if (!FECHA_REGEX.test(fecha || '')) {
    return res.status(400).json({ error: 'Fecha invalida' });
  }
  if (plantillaId) {
    const ok = await validarPlantillasDeEmpresa([plantillaId], req.admin.empresaId);
    if (!ok) return res.status(400).json({ error: 'La plantilla no existe' });
  }
  if (!libre && !plantillaId && (!HORA_REGEX.test(horaEntrada || '') || !HORA_REGEX.test(horaSalida || ''))) {
    return res.status(400).json({ error: 'Indica una plantilla, un horario valido, o marca el dia como libre' });
  }

  const creada = await horarioService.crearExcepcion(worker.id, {
    fecha,
    libre,
    plantillaId,
    horaEntrada,
    horaSalida,
    motivo
  });
  res.status(201).json(creada);
}

async function eliminarExcepcionTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  const borrados = await horarioService.eliminarExcepcion(req.params.excepcionId, worker.id);
  if (!borrados) {
    return res.status(404).json({ error: 'Excepcion no encontrada' });
  }
  res.json({ ok: true });
}

module.exports = {
  paginaLogin,
  paginaDashboard,
  paginaHistorial,
  paginaTrabajadores,
  paginaHorarioTrabajador,
  paginaTurnos,
  paginaConfiguracion,
  qrDeHoy,
  qrDeHoyImagen,
  regenerarQr,
  asistenciaDeHoy,
  asistenciaPorFecha,
  exportarCsv,
  listarWorkers,
  actualizarWorker,
  editarAsistencia,
  cambiarEstadoHorasExtra,
  subirLogo,
  servirLogo,
  obtenerConfiguracionEmpresa,
  guardarConfiguracionEmpresa,
  obtenerHorarioTrabajador,
  guardarHorarioTrabajador,
  listarTurnos,
  crearTurno,
  actualizarTurno,
  eliminarTurno,
  listarExcepcionesTrabajador,
  crearExcepcionTrabajador,
  eliminarExcepcionTrabajador
};
