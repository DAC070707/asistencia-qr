const db = require('../config/db');

const MOTIVOS = ['sin_permiso', 'sin_senal', 'tiempo_agotado', 'fuera_de_rango', 'sin_ubicacion', 'navegador_sin_soporte'];

// 'iphone' | 'android' | 'otro', a partir del user agent.
function detectarDispositivo(userAgent) {
  const ua = String(userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iphone';
  if (/Android/i.test(ua)) return 'android';
  return 'otro';
}

function numeroONull(valor) {
  const n = Number(valor);
  return valor === undefined || valor === null || valor === '' || !Number.isFinite(n) ? null : n;
}

// Nunca debe romper la marcacion: si falla el insert, solo se registra en consola.
async function registrar({ empresaId, sucursalId, workerId, accion, motivo, distanciaMetros, precisionMetros, userAgent }) {
  if (!MOTIVOS.includes(motivo)) return;
  try {
    await db('intentos_marcacion_rechazados').insert({
      empresa_id: empresaId,
      sucursal_id: sucursalId ?? null,
      worker_id: workerId ?? null,
      accion: accion ? String(accion).slice(0, 30) : null,
      motivo,
      distancia_m: numeroONull(distanciaMetros),
      precision_m: numeroONull(precisionMetros),
      dispositivo: detectarDispositivo(userAgent),
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null
    });
  } catch (err) {
    console.error('No se pudo registrar el intento rechazado:', err.message);
  }
}

async function listarRecientes(empresaId, dias = 7) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  return db('intentos_marcacion_rechazados as i')
    .leftJoin('workers as w', 'w.id', 'i.worker_id')
    .leftJoin('sucursales as s', 's.id', 'i.sucursal_id')
    .where('i.empresa_id', empresaId)
    .andWhere('i.creado_en', '>=', desde)
    .orderBy('i.creado_en', 'desc')
    .limit(200)
    .select(
      'i.id',
      'i.accion',
      'i.motivo',
      'i.distancia_m',
      'i.precision_m',
      'i.dispositivo',
      'i.creado_en',
      'w.nombre as worker_nombre',
      'w.dni as worker_dni',
      's.nombre as sucursal_nombre'
    );
}

module.exports = { MOTIVOS, detectarDispositivo, registrar, listarRecientes, numeroONull };
