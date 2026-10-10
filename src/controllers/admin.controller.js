const ExcelJS = require('exceljs');
const dailyCodeService = require('../services/dailyCode.service');
const qrImageService = require('../services/qrImage.service');
const attendanceService = require('../services/attendance.service');
const horarioService = require('../services/horario.service');
const sucursalService = require('../services/sucursal.service');
const intentosService = require('../services/intentos.service');
const env = require('../config/env');
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
    controlaRefrigerio: empresa.controla_refrigerio,
    gestionaObreros: empresa.gestiona_obreros,
    regimenObreros: empresa.regimen_obreros,
    porcentajesExtra: {
      empleado: { tramo1: empresa.extra_tramo1_empleado, tramo2: empresa.extra_tramo2_empleado },
      obrero: { tramo1: empresa.extra_tramo1_obrero, tramo2: empresa.extra_tramo2_obrero }
    }
  });
}

const REGIMENES_OBREROS = ['general', 'construccion_civil', 'mineria'];

function porcentajeValido(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 300 ? n : null;
}

// Actualizacion parcial: cada tarjeta de Configuracion guarda solo lo suyo.
async function guardarConfiguracionEmpresa(req, res) {
  const { toleranciaEntradaMinutos, controlaRefrigerio, gestionaObreros, regimenObreros, porcentajesExtra } = req.body;
  const cambios = {};

  if (toleranciaEntradaMinutos !== undefined) {
    const minutos = Number(toleranciaEntradaMinutos);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > 120) {
      return res.status(400).json({ error: 'La tolerancia debe ser un entero entre 0 y 120 minutos' });
    }
    cambios.tolerancia_entrada_minutos = minutos;
  }
  if (controlaRefrigerio !== undefined) {
    cambios.controla_refrigerio = Boolean(controlaRefrigerio);
  }
  if (gestionaObreros !== undefined) {
    cambios.gestiona_obreros = Boolean(gestionaObreros);
  }
  if (regimenObreros !== undefined) {
    if (!REGIMENES_OBREROS.includes(regimenObreros)) {
      return res.status(400).json({ error: 'Régimen de obreros inválido' });
    }
    cambios.regimen_obreros = regimenObreros;
  }
  if (porcentajesExtra !== undefined) {
    for (const tipo of ['empleado', 'obrero']) {
      const p = porcentajesExtra?.[tipo];
      if (!p) continue;
      const t1 = porcentajeValido(p.tramo1);
      const t2 = porcentajeValido(p.tramo2);
      if (t1 === null || t2 === null) {
        return res.status(400).json({ error: 'Los porcentajes de horas extra deben ser enteros entre 0 y 300' });
      }
      cambios[`extra_tramo1_${tipo}`] = t1;
      cambios[`extra_tramo2_${tipo}`] = t2;
    }
  }
  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'Nada que guardar' });
  }

  await db('empresas').where({ id: req.admin.empresaId }).update(cambios);
  return obtenerConfiguracionEmpresa(req, res);
}

function serializarSucursal(s) {
  return {
    id: s.id,
    nombre: s.nombre,
    direccion: s.direccion || '',
    lat: s.lat != null ? Number(s.lat) : null,
    lng: s.lng != null ? Number(s.lng) : null,
    radioMetros: s.radio_metros,
    geolocalizacionActiva: s.geolocalizacion_activa,
    activo: s.activo
  };
}

async function listarSucursales(req, res) {
  const sucursales = await sucursalService.listar(req.admin.empresaId);
  res.json(sucursales.map(serializarSucursal));
}

async function crearSucursal(req, res) {
  const nombre = String(req.body.nombre || '').trim();
  if (nombre.length < 2) {
    return res.status(400).json({ error: 'Ingresa el nombre de la sucursal' });
  }
  const creada = await sucursalService.crear(req.admin.empresaId, { nombre });
  res.status(201).json(serializarSucursal(creada));
}

// Actualizacion parcial de una sucursal de la empresa del admin. Un id de otra
// empresa responde 404 (igual que uno inexistente).
async function actualizarSucursal(req, res) {
  const sucursal = await sucursalService.obtenerDeEmpresa(Number(req.params.id), req.admin.empresaId);
  if (!sucursal) {
    return res.status(404).json({ error: 'Sucursal no encontrada' });
  }

  const { nombre, direccion, lat, lng, radioMetros, geolocalizacionActiva } = req.body;
  const cambios = {};

  if (nombre !== undefined) {
    const n = String(nombre).trim();
    if (n.length < 2) return res.status(400).json({ error: 'Ingresa el nombre de la sucursal' });
    cambios.nombre = n.slice(0, 120);
  }

  if (radioMetros !== undefined || lat !== undefined || lng !== undefined || geolocalizacionActiva !== undefined) {
    const radio = Number(radioMetros);
    if (!Number.isInteger(radio) || radio < 10 || radio > 5000) {
      return res.status(400).json({ error: 'El radio debe ser un entero entre 10 y 5000 metros' });
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

  const [actualizada] = await db('sucursales')
    .where({ id: sucursal.id, empresa_id: req.admin.empresaId })
    .update(cambios)
    .returning('*');
  res.json(serializarSucursal(actualizada));
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
    logoEmpresaUrl: `/logo/${req.admin.empresaId}`,
    googleMapsApiKey: env.googleMapsApiKey
  });
}

// Intentos de marcacion rechazados por ubicacion (ultimos 7 dias) de la
// propia empresa, para diagnosticar quien tiene problemas al marcar.
async function listarIntentosRechazados(req, res) {
  res.json(await intentosService.listarRecientes(req.admin.empresaId, 7));
}

// Resuelve la sucursal del parametro sucursal_id (query o body); sin parametro
// es la Principal. Un id de otra empresa responde 404 y devuelve null.
async function sucursalDeRequest(req, res, origen) {
  const sucursal = await sucursalService.resolverParaAdmin(origen.sucursal_id, req.admin.empresaId);
  if (!sucursal) {
    res.status(404).json({ error: 'Sucursal no encontrada' });
    return null;
  }
  return sucursal;
}

async function qrDeHoy(req, res) {
  const sucursal = await sucursalDeRequest(req, res, req.query);
  if (!sucursal) return;
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId, sucursal.id);
  res.json({
    fecha: formatoFecha(codigo.fecha),
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token),
    sucursal: { id: sucursal.id, nombre: sucursal.nombre }
  });
}

async function qrDeHoyImagen(req, res) {
  const sucursal = await sucursalDeRequest(req, res, req.query);
  if (!sucursal) return;
  const codigo = await dailyCodeService.obtenerOCrearCodigoDeHoy(req.admin.empresaId, sucursal.id);
  const buffer = await qrImageService.generarPngBuffer(codigo.token);
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(buffer);
}

async function regenerarQr(req, res) {
  const sucursal = await sucursalDeRequest(req, res, req.body || {});
  if (!sucursal) return;
  const codigo = await dailyCodeService.regenerarCodigoDeHoy(
    req.admin.empresaId,
    sucursal.id,
    req.admin.id
  );
  res.json({
    fecha: formatoFecha(codigo.fecha),
    token: codigo.token,
    url: qrImageService.urlCheckin(codigo.token),
    sucursal: { id: sucursal.id, nombre: sucursal.nombre }
  });
}

async function asistenciaDeHoy(req, res) {
  const sucursal = await sucursalDeRequest(req, res, req.query);
  if (!sucursal) return;
  const principal = await sucursalService.obtenerPrincipal(req.admin.empresaId);
  const registros = await attendanceService.listarAsistenciaDeHoy(req.admin.empresaId, {
    id: sucursal.id,
    esPrincipal: sucursal.id === principal.id
  });
  res.json(registros);
}

function parametrosRango(query) {
  const hoy = hoyLima();
  const desde = query.desde || query.fecha || hoy;
  const hasta = query.hasta || query.fecha || hoy;
  const workerId = query.worker_id || null;
  const sucursalAsignadaId = Number.isInteger(Number(query.sucursal_id)) && Number(query.sucursal_id) > 0
    ? Number(query.sucursal_id)
    : null;

  if (!FECHA_REGEX.test(desde) || !FECHA_REGEX.test(hasta)) {
    return { error: 'Formato de fecha invalido, usa YYYY-MM-DD' };
  }
  if (desde > hasta) {
    return { error: 'La fecha "desde" no puede ser posterior a "hasta"' };
  }
  const tipoTrabajador = ['empleado', 'obrero'].includes(query.tipo) ? query.tipo : null;
  return { desde, hasta, workerId, sucursalAsignadaId, tipoTrabajador };
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

const AZUL_ENCABEZADO = 'FF4472C4';
const AMARILLO_LEIDA = 'FFFFF2CC';
const BORDE_FINO = { style: 'thin', color: { argb: 'FFB7B7B7' } };
const BORDES_CELDA = { top: BORDE_FINO, left: BORDE_FINO, bottom: BORDE_FINO, right: BORDE_FINO };

function formatoHoraLima(valor) {
  return valor
    ? new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(new Date(valor))
    : '';
}

function formatoFechaDDMMYYYY(fechaTxt) {
  const [anio, mes, dia] = fechaTxt.split('-');
  return `${dia}/${mes}/${anio}`;
}

const CATEGORIAS = { operario: 'Operario', oficial: 'Oficial', peon: 'Peón' };
const TIPOS_TRABAJADOR = { empleado: 'Empleado', obrero: 'Obrero' };

// Porcentajes de recargo [tramo 1 (2 primeras horas), tramo 2] por tipo.
function porcentajesDe(empresa, tipo) {
  return tipo === 'obrero'
    ? [empresa.extra_tramo1_obrero, empresa.extra_tramo2_obrero]
    : [empresa.extra_tramo1_empleado, empresa.extra_tramo2_empleado];
}

function estiloEncabezado(fila) {
  fila.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
    celda.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.border = BORDES_CELDA;
  });
}

async function exportarExcel(req, res) {
  const rango = parametrosRango(req.query);
  if (rango.error) {
    return res.status(400).json({ error: rango.error });
  }
  const { desde, hasta, workerId, sucursalAsignadaId, tipoTrabajador } = rango;

  const empresa = await db('empresas').where({ id: req.admin.empresaId }).first();
  const conRefrigerio = Boolean(empresa.controla_refrigerio);
  const conObreros = Boolean(empresa.gestiona_obreros);
  const conCategoria = conObreros && empresa.regimen_obreros === 'construccion_civil';

  const filas = await horarioService.construirGrillaAsistencia({
    empresaId: req.admin.empresaId,
    desde,
    hasta,
    workerId,
    sucursalId: sucursalAsignadaId,
    tipoTrabajador: conObreros ? tipoTrabajador : null
  });
  const empresaNombre = empresa.nombre;

  // Rotulos de horas extra: con un solo juego de porcentajes van en el
  // encabezado ("Horas extra 25%"); si empleados y obreros tienen distintos,
  // el encabezado es generico y cada fila indica sus recargos.
  const tipoUnico = !conObreros ? 'empleado' : tipoTrabajador || null;
  const pctEmpleado = porcentajesDe(empresa, 'empleado');
  const pctObrero = porcentajesDe(empresa, 'obrero');
  const mismosPct = pctEmpleado[0] === pctObrero[0] && pctEmpleado[1] === pctObrero[1];
  const pctEncabezado = tipoUnico ? porcentajesDe(empresa, tipoUnico) : mismosPct ? pctEmpleado : null;
  const tituloTramo1 = pctEncabezado ? `Horas extra ${pctEncabezado[0]}%` : 'Horas extra 1er tramo (2 primeras)';
  const tituloTramo2 = pctEncabezado ? `Horas extra ${pctEncabezado[1]}%` : 'Horas extra 2do tramo';
  const recargosDe = (worker) => {
    const [t1, t2] = porcentajesDe(empresa, worker.tipo_trabajador);
    return `${t1}% / ${t2}%`;
  };

  const workbook = new ExcelJS.Workbook();

  // ---- Hoja 1: Resumen por trabajador ----
  const resumenPorWorker = new Map();
  for (const f of filas) {
    const acc = resumenPorWorker.get(f.worker.id) || {
      worker: f.worker,
      inasistencias: 0,
      horasExtra25: 0,
      horasExtra35: 0,
      horasNocturnas: 0,
      descansosTrabajados: 0
    };
    if (f.inasistencia) acc.inasistencias += 1;
    acc.horasExtra25 += f.horasExtra25;
    acc.horasExtra35 += f.horasExtra35;
    acc.horasNocturnas += f.horasNocturnas || 0;
    if (f.descansoTrabajado) acc.descansosTrabajados += 1;
    resumenPorWorker.set(f.worker.id, acc);
  }

  const columnasResumen = [
    { header: 'Trabajador', key: 'nombre', width: 30 },
    { header: 'DNI', key: 'dni', width: 14 }
  ];
  if (conObreros) columnasResumen.push({ header: 'Tipo', key: 'tipo', width: 12 });
  if (conCategoria) columnasResumen.push({ header: 'Categoría', key: 'categoria', width: 12 });
  columnasResumen.push(
    { header: 'Inasistencias', key: 'inasistencias', width: 16 },
    { header: tituloTramo1, key: 'horasExtra25', width: 18 },
    { header: tituloTramo2, key: 'horasExtra35', width: 18 }
  );
  if (!pctEncabezado) columnasResumen.push({ header: 'Recargos', key: 'recargos', width: 14 });
  if (conObreros) {
    columnasResumen.push(
      { header: 'Horas nocturnas (22:00–06:00)', key: 'horasNocturnas', width: 18 },
      { header: 'Días de descanso trabajados', key: 'descansosTrabajados', width: 18 }
    );
  }

  const hojaResumen = workbook.addWorksheet('Resumen');
  hojaResumen.columns = columnasResumen;
  estiloEncabezado(hojaResumen.getRow(1));
  for (const [, r] of resumenPorWorker) {
    const fila = hojaResumen.addRow({
      nombre: r.worker.nombre,
      dni: r.worker.dni,
      tipo: TIPOS_TRABAJADOR[r.worker.tipo_trabajador] || '',
      categoria: CATEGORIAS[r.worker.categoria] || '',
      inasistencias: r.inasistencias,
      horasExtra25: Number(r.horasExtra25.toFixed(2)),
      horasExtra35: Number(r.horasExtra35.toFixed(2)),
      recargos: recargosDe(r.worker),
      horasNocturnas: Number(r.horasNocturnas.toFixed(2)),
      descansosTrabajados: r.descansosTrabajados
    });
    fila.eachCell((celda) => {
      celda.border = BORDES_CELDA;
    });
  }

  // ---- Hoja 2: Detalle (formato solicitado) ----
  // Las columnas de refrigerio solo existen si la empresa lo controla, y las
  // de obreros solo si gestiona obreros; sin ellas el formato es exactamente
  // el de la plantilla original.
  const columnasDetalle = [
    { ancho: 12, titulo: 'Fecha', valor: (f) => formatoFechaDDMMYYYY(f.fecha), azul: true },
    { ancho: 12, titulo: 'DNI', valor: (f) => f.worker.dni, azul: true },
    { ancho: 28, titulo: 'Nombre', valor: (f) => f.worker.nombre, azul: true }
  ];
  if (conObreros) {
    columnasDetalle.push({ ancho: 11, titulo: 'Tipo', valor: (f) => TIPOS_TRABAJADOR[f.worker.tipo_trabajador] || '' });
  }
  if (conCategoria) {
    columnasDetalle.push({ ancho: 11, titulo: 'Categoría', valor: (f) => CATEGORIAS[f.worker.categoria] || '' });
  }
  columnasDetalle.push(
    { ancho: 16, titulo: 'Hora entrada (leída)', valor: (f) => formatoHoraLima(f.horaEntrada), amarillo: true },
    { ancho: 12, titulo: 'Tardanza (min)', valor: (f) => f.tardanzaMinutos || '', total: 'tardanza' },
    { ancho: 16, titulo: 'Hora salida (leída)', valor: (f) => formatoHoraLima(f.horaSalida), amarillo: true }
  );
  if (conRefrigerio) {
    columnasDetalle.push(
      { ancho: 16, titulo: 'Salida refrigerio', valor: (f) => formatoHoraLima(f.refrigerioSalida), amarillo: true },
      { ancho: 16, titulo: 'Regreso refrigerio', valor: (f) => formatoHoraLima(f.refrigerioRegreso), amarillo: true }
    );
  }
  if (conObreros) {
    columnasDetalle.push(
      { ancho: 9, titulo: 'Turno', valor: (f) => (f.turno === 'noche' ? 'Noche' : f.turno === 'dia' ? 'Día' : '') },
      { ancho: 14, titulo: 'Horas nocturnas (22–06)', valor: (f) => f.horasNocturnas || '', total: 'nocturnas' }
    );
  }
  columnasDetalle.push(
    { ancho: 16, titulo: tituloTramo1, valor: (f) => f.horasExtra25 || '', total: 'extra25' },
    { ancho: 16, titulo: tituloTramo2, valor: (f) => f.horasExtra35 || '', total: 'extra35' }
  );
  if (!pctEncabezado) {
    columnasDetalle.push({ ancho: 12, titulo: 'Recargos', valor: (f) => recargosDe(f.worker) });
  }
  columnasDetalle.push({
    ancho: 32,
    titulo: 'Observaciones (Colocar si hubo inasistencia)',
    valor: (f) => (f.inasistencia ? 'Inasistencia' : f.descansoTrabajado && conObreros ? 'Trabajó en día de descanso' : '')
  });

  const hojaDetalle = workbook.addWorksheet('Detalle');
  hojaDetalle.columns = columnasDetalle.map((c, i) => ({ key: 'c' + i, width: c.ancho }));

  const ultimaColumna = String.fromCharCode(64 + columnasDetalle.length);
  hojaDetalle.mergeCells(`A1:${ultimaColumna}1`);
  const celdaTitulo = hojaDetalle.getCell('A1');
  celdaTitulo.value = `Control de asistencia — General (${empresaNombre})`;
  celdaTitulo.font = { bold: true, size: 13 };

  estiloEncabezado(hojaDetalle.addRow(columnasDetalle.map((c) => c.titulo)));

  const totales = { tardanza: 0, extra25: 0, extra35: 0, nocturnas: 0 };

  filas
    .sort((a, b) => (a.fecha === b.fecha ? a.worker.nombre.localeCompare(b.worker.nombre) : a.fecha < b.fecha ? -1 : 1))
    .forEach((f) => {
      totales.tardanza += f.tardanzaMinutos || 0;
      totales.extra25 += f.horasExtra25;
      totales.extra35 += f.horasExtra35;
      totales.nocturnas += f.horasNocturnas || 0;

      const fila = hojaDetalle.addRow(columnasDetalle.map((c) => c.valor(f)));
      fila.eachCell((celda) => {
        celda.border = BORDES_CELDA;
      });
      columnasDetalle.forEach((c, i) => {
        const celda = fila.getCell(i + 1);
        if (c.azul) celda.font = { color: { argb: 'FF1155CC' } };
        if (c.amarillo) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO_LEIDA } };
      });
    });

  const filaTotales = hojaDetalle.addRow(
    columnasDetalle.map((c, i) => {
      if (i === 0) return 'Totales';
      if (c.total === 'tardanza') return Number(totales.tardanza.toFixed(0));
      if (c.total === 'extra25') return Number(totales.extra25.toFixed(2));
      if (c.total === 'extra35') return Number(totales.extra35.toFixed(2));
      if (c.total === 'nocturnas') return Number(totales.nocturnas.toFixed(2));
      return '';
    })
  );
  filaTotales.eachCell((celda) => {
    celda.font = { bold: true };
    celda.border = BORDES_CELDA;
  });

  // ---- Hoja 3: Control de ciclo (obreros con jornada atipica) ----
  if (conObreros && tipoTrabajador !== 'empleado') {
    const ciclosFilas = await horarioService.controlDeCiclos({
      empresaId: req.admin.empresaId,
      desde,
      hasta,
      workerId,
      sucursalId: sucursalAsignadaId
    });
    if (ciclosFilas.length > 0) {
      const hojaCiclo = workbook.addWorksheet('Control de ciclo');
      hojaCiclo.columns = [
        { header: 'Obrero', key: 'nombre', width: 28 },
        { header: 'DNI', key: 'dni', width: 12 },
        { header: 'Jornada', key: 'jornada', width: 10 },
        { header: 'Ciclo desde', key: 'inicio', width: 12 },
        { header: 'Ciclo hasta', key: 'fin', width: 12 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Días del ciclo', key: 'diasCiclo', width: 10 },
        { header: 'Días programados de trabajo', key: 'diasProgramados', width: 14 },
        { header: 'Días trabajados', key: 'diasTrabajados', width: 11 },
        { header: 'Descansos trabajados', key: 'descansosTrabajados', width: 12 },
        { header: 'Horas netas trabajadas', key: 'horasNetas', width: 13 },
        { header: 'Promedio diario (h)', key: 'promedioDiario', width: 12 },
        { header: 'Promedio semanal (h)', key: 'promedioSemanal', width: 12 },
        { header: 'Máximo legal del ciclo (8 h × días)', key: 'limiteCiclo', width: 16 },
        { header: 'Exceso sobre el promedio legal (h)', key: 'exceso', width: 16 }
      ];
      estiloEncabezado(hojaCiclo.getRow(1));
      for (const c of ciclosFilas) {
        const fila = hojaCiclo.addRow({
          nombre: c.worker.nombre,
          dni: c.worker.dni,
          jornada: c.jornada,
          inicio: formatoFechaDDMMYYYY(c.inicio),
          fin: formatoFechaDDMMYYYY(c.fin),
          estado: c.completo ? 'Completo' : 'En curso',
          diasCiclo: c.diasCiclo,
          diasProgramados: c.diasProgramados,
          diasTrabajados: c.diasTrabajados,
          descansosTrabajados: c.descansosTrabajados,
          horasNetas: c.horasNetas,
          promedioDiario: c.promedioDiario,
          promedioSemanal: c.promedioSemanal,
          limiteCiclo: c.limiteCiclo,
          exceso: c.exceso
        });
        fila.eachCell((celda) => {
          celda.border = BORDES_CELDA;
        });
        if (c.promedioSemanal > 48) {
          fila.getCell('promedioSemanal').font = { color: { argb: 'FFC00000' }, bold: true };
        }
        if (c.exceso > 0) fila.getCell('exceso').font = { color: { argb: 'FFC00000' }, bold: true };
      }
      const nota = hojaCiclo.addRow([]);
      nota.getCell(1).value =
        'Promedio según art. 9 D.S. 008-2002-TR: horas trabajadas del ciclo ÷ todos los días del ciclo (incluye descansos). Máximo: 8 h diarias / 48 h semanales en promedio. Refrigerio descontado (marcado, o el configurado en la jornada).';
      nota.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nombreArchivo = desde === hasta ? desde : `${desde}_a_${hasta}`;
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="asistencia_${nombreArchivo}.xlsx"`);
  res.send(buffer);
}

async function listarWorkers(req, res) {
  // tipo_horario = tipo del horario vigente hoy (null si no tiene).
  const workers = await db('workers')
    .where({ empresa_id: req.admin.empresaId })
    .orderBy('nombre', 'asc')
    .select(
      'workers.*',
      db.raw(
        '(select v.tipo from horario_versiones v where v.worker_id = workers.id and v.vigente_desde <= ? order by v.vigente_desde desc limit 1) as tipo_horario',
        [hoyLima()]
      )
    );
  res.json(workers);
}

async function actualizarWorker(req, res) {
  const { id } = req.params;
  const {
    activo,
    nombre,
    horas_extra_activas,
    dispositivo_vinculado,
    fecha_ingreso,
    sucursal_id,
    tipo_trabajador,
    categoria
  } = req.body;

  const cambios = {};
  if (sucursal_id !== undefined) {
    if (sucursal_id === null || sucursal_id === '') {
      cambios.sucursal_id = null;
    } else {
      const sucursal = await sucursalService.obtenerDeEmpresa(Number(sucursal_id), req.admin.empresaId);
      if (!sucursal) return res.status(400).json({ error: 'Sucursal invalida' });
      cambios.sucursal_id = sucursal.id;
    }
  }
  if (tipo_trabajador !== undefined) {
    if (!['empleado', 'obrero'].includes(tipo_trabajador)) {
      return res.status(400).json({ error: 'Tipo de trabajador inválido' });
    }
    cambios.tipo_trabajador = tipo_trabajador;
    if (tipo_trabajador === 'empleado') cambios.categoria = null;
  }
  if (categoria !== undefined && cambios.tipo_trabajador !== 'empleado') {
    if (categoria !== null && categoria !== '' && !Object.keys(CATEGORIAS).includes(categoria)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    cambios.categoria = categoria || null;
  }
  if (typeof activo === 'boolean') cambios.activo = activo;
  if (typeof horas_extra_activas === 'boolean') cambios.horas_extra_activas = horas_extra_activas;
  if (typeof nombre === 'string' && nombre.trim()) cambios.nombre = nombre.trim();
  // Solo se permite desvincular (false) desde el panel admin — vincular
  // (true) es exclusivo del flujo de identificacion en checkin.controller.
  if (dispositivo_vinculado === false) cambios.dispositivo_vinculado = false;
  if (fecha_ingreso !== undefined) {
    if (fecha_ingreso === null || fecha_ingreso === '') {
      cambios.fecha_ingreso = null;
    } else if (FECHA_REGEX.test(fecha_ingreso)) {
      cambios.fecha_ingreso = fecha_ingreso;
    } else {
      return res.status(400).json({ error: 'Fecha de ingreso invalida, usa YYYY-MM-DD' });
    }
  }

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
  // Activar/desactivar horas extra recalcula todo su historial
  // (desactivadas => 0; reactivadas => vuelven a calcularse).
  if (cambios.horas_extra_activas !== undefined) {
    await horarioService.recalcularHorasExtra(actualizado.id);
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

// ---- Horarios del trabajador (versiones con fecha de vigencia) ----

async function listarHorariosTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  res.json(await horarioService.listarVersiones(worker.id));
}

async function validarPlantillasDeEmpresa(ids, empresaId) {
  if (ids.length === 0) return true;
  const filas = await db('plantillas_turno')
    .where({ empresa_id: empresaId })
    .whereIn('id', ids);
  return filas.length === new Set(ids).size;
}

// Valida { vigenteDesde, tipo, semanal | rotacion } del body. Devuelve
// { error } o { datos } listo para el servicio.
function enteroEntre(valor, min, max) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

async function validarHorarioDelBody(body, empresaId) {
  const { vigenteDesde, tipo, semanal, rotacion, ciclo } = body || {};
  if (!FECHA_REGEX.test(vigenteDesde || '')) {
    return { error: 'Indica desde qué fecha aplica el horario' };
  }

  if (tipo === 'semanal') {
    if (!Array.isArray(semanal) || semanal.length !== 7) {
      return { error: 'Se requieren los 7 dias de la semana' };
    }
    const dias = new Set(semanal.map((d) => d.diaSemana));
    if (dias.size !== 7 || [...dias].some((d) => d < 0 || d > 6)) {
      return { error: 'Dias de la semana invalidos o repetidos' };
    }
    for (const d of semanal) {
      if (!d.libre && (!HORA_REGEX.test(d.horaEntrada || '') || !HORA_REGEX.test(d.horaSalida || ''))) {
        return { error: 'Hora invalida, usa HH:MM' };
      }
    }
    return { datos: { vigenteDesde, tipo, semanal } };
  }

  if (tipo === 'rotativo') {
    if (!rotacion || !FECHA_REGEX.test(rotacion.fechaAncla || '')) {
      return { error: 'Fecha ancla invalida' };
    }
    if (!Array.isArray(rotacion.pasos) || rotacion.pasos.length === 0) {
      return { error: 'La rotacion necesita al menos un paso' };
    }
    const idsValidos = await validarPlantillasDeEmpresa(rotacion.pasos, empresaId);
    if (!idsValidos) {
      return { error: 'Alguna plantilla de turno no existe' };
    }
    return { datos: { vigenteDesde, tipo, rotacion } };
  }

  if (tipo === 'ciclo') {
    const c = ciclo || {};
    if (!FECHA_REGEX.test(c.fechaInicio || '')) {
      return { error: 'Indica el primer día de trabajo del ciclo' };
    }
    const diasTrabajo = enteroEntre(c.diasTrabajo, 1, 60);
    const diasDescanso = enteroEntre(c.diasDescanso, 0, 60);
    if (diasTrabajo === null || diasDescanso === null) {
      return { error: 'Días de trabajo (1 a 60) y de descanso (0 a 60) inválidos' };
    }
    if (!HORA_REGEX.test(c.horaEntrada || '') || !HORA_REGEX.test(c.horaSalida || '')) {
      return { error: 'Hora invalida, usa HH:MM' };
    }
    const refrigerioMin = c.refrigerioMin === undefined || c.refrigerioMin === '' ? 0 : enteroEntre(c.refrigerioMin, 0, 240);
    if (refrigerioMin === null) {
      return { error: 'El refrigerio debe estar entre 0 y 240 minutos' };
    }
    let diasTurnoDia = null;
    if (c.diasTurnoDia !== undefined && c.diasTurnoDia !== null && c.diasTurnoDia !== '') {
      diasTurnoDia = enteroEntre(c.diasTurnoDia, 0, diasTrabajo - 1);
      if (diasTurnoDia === null) {
        return { error: 'Los días en turno día deben ser menos que los días de trabajo' };
      }
      if (!HORA_REGEX.test(c.nocheHoraEntrada || '') || !HORA_REGEX.test(c.nocheHoraSalida || '')) {
        return { error: 'Indica la hora de entrada y salida del turno noche' };
      }
    }
    return {
      datos: {
        vigenteDesde,
        tipo,
        ciclo: {
          fechaInicio: c.fechaInicio,
          diasTrabajo,
          diasDescanso,
          horaEntrada: c.horaEntrada.slice(0, 5),
          horaSalida: c.horaSalida.slice(0, 5),
          refrigerioMin,
          diasTurnoDia,
          nocheHoraEntrada: diasTurnoDia !== null ? c.nocheHoraEntrada.slice(0, 5) : null,
          nocheHoraSalida: diasTurnoDia !== null ? c.nocheHoraSalida.slice(0, 5) : null
        }
      }
    };
  }

  return { error: 'Tipo de horario invalido' };
}

// Nuevo horario vigente desde una fecha. El horario anterior queda intacto
// para las fechas previas; las horas extra se recalculan desde esa fecha.
async function crearHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  const { error, datos } = await validarHorarioDelBody(req.body, req.admin.empresaId);
  if (error) return res.status(400).json({ error });

  await horarioService.crearVersion(worker.id, datos);
  await horarioService.recalcularHorasExtra(worker.id, { desde: datos.vigenteDesde });
  res.status(201).json(await horarioService.listarVersiones(worker.id));
}

async function actualizarHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  const { error, datos } = await validarHorarioDelBody(req.body, req.admin.empresaId);
  if (error) return res.status(400).json({ error });

  const resultado = await horarioService.actualizarVersion(worker.id, req.params.versionId, datos);
  if (!resultado) {
    return res.status(404).json({ error: 'Horario no encontrado' });
  }
  if (resultado.conflicto) {
    return res.status(409).json({ error: 'Ya hay otro horario que aplica desde esa fecha' });
  }

  const desde = [datos.vigenteDesde, resultado.desdeAnterior].sort()[0];
  await horarioService.recalcularHorasExtra(worker.id, { desde });
  res.json(await horarioService.listarVersiones(worker.id));
}

async function eliminarHorarioTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  const desde = await horarioService.eliminarVersion(worker.id, req.params.versionId);
  if (!desde) {
    return res.status(404).json({ error: 'Horario no encontrado' });
  }
  await horarioService.recalcularHorasExtra(worker.id, { desde });
  res.json(await horarioService.listarVersiones(worker.id));
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
  for (const workerId of await horarioService.trabajadoresQueUsanPlantilla(actualizada.id)) {
    await horarioService.recalcularHorasExtra(workerId);
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
  await horarioService.recalcularHorasExtra(worker.id, { desde: fecha, hasta: fecha });
  res.status(201).json(creada);
}

async function eliminarExcepcionTrabajador(req, res) {
  const worker = await workerDeEmpresa(req.params.id, req.admin.empresaId);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }
  const borrada = await horarioService.eliminarExcepcion(req.params.excepcionId, worker.id);
  if (!borrada) {
    return res.status(404).json({ error: 'Excepcion no encontrada' });
  }
  const fecha = formatoFecha(borrada.fecha);
  await horarioService.recalcularHorasExtra(worker.id, { desde: fecha, hasta: fecha });
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
  exportarExcel,
  listarWorkers,
  actualizarWorker,
  editarAsistencia,
  cambiarEstadoHorasExtra,
  subirLogo,
  servirLogo,
  obtenerConfiguracionEmpresa,
  guardarConfiguracionEmpresa,
  listarSucursales,
  crearSucursal,
  actualizarSucursal,
  listarIntentosRechazados,
  listarHorariosTrabajador,
  crearHorarioTrabajador,
  actualizarHorarioTrabajador,
  eliminarHorarioTrabajador,
  listarTurnos,
  crearTurno,
  actualizarTurno,
  eliminarTurno,
  listarExcepcionesTrabajador,
  crearExcepcionTrabajador,
  eliminarExcepcionTrabajador
};
