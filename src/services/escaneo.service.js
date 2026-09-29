const crypto = require('crypto');
const db = require('../config/db');

// Un escaneo sirve para una sola marcacion y vence a los 10 minutos.
const VIGENCIA_MS = 10 * 60 * 1000;
const RETENCION_MS = 2 * 24 * 60 * 60 * 1000;

// codigoQr: la fila de daily_codes del QR escaneado.
async function crear(codigoQr, workerId) {
  // Limpieza de escaneos viejos (barato: indice por creado_en).
  await db('escaneos_qr').where('creado_en', '<', new Date(Date.now() - RETENCION_MS)).del();

  const [creado] = await db('escaneos_qr')
    .insert({
      codigo: crypto.randomBytes(16).toString('hex'),
      daily_code_id: codigoQr.id,
      empresa_id: codigoQr.empresa_id,
      sucursal_id: codigoQr.sucursal_id ?? null,
      worker_id: workerId ?? null
    })
    .returning('*');
  return creado;
}

// Devuelve { ok:true, escaneo } o { ok:false, motivo }. Si el escaneo aun no
// tiene trabajador, lo asocia a este (queda amarrado a el).
async function validar(codigo, dailyCodeId, workerId) {
  if (!codigo || typeof codigo !== 'string') return { ok: false, motivo: 'invalido' };

  const escaneo = await db('escaneos_qr').where({ codigo, daily_code_id: dailyCodeId }).first();
  if (!escaneo) return { ok: false, motivo: 'invalido' };
  if (escaneo.usado_en) return { ok: false, motivo: 'usado' };
  if (Date.now() - new Date(escaneo.creado_en).getTime() > VIGENCIA_MS) return { ok: false, motivo: 'vencido' };

  if (workerId) {
    if (escaneo.worker_id && escaneo.worker_id !== workerId) return { ok: false, motivo: 'otro_trabajador' };
    if (!escaneo.worker_id) {
      const [asociado] = await db('escaneos_qr')
        .where({ id: escaneo.id })
        .whereNull('worker_id')
        .update({ worker_id: workerId })
        .returning('*');
      if (!asociado) return { ok: false, motivo: 'otro_trabajador' };
      return { ok: true, escaneo: asociado };
    }
  }
  return { ok: true, escaneo };
}

// Reclama el escaneo de forma atomica: si dos envios llegan a la vez, solo
// uno obtiene true.
async function consumir(id) {
  const filas = await db('escaneos_qr').where({ id }).whereNull('usado_en').update({ usado_en: db.fn.now() });
  return filas === 1;
}

// Devuelve el escaneo a "sin usar" cuando la marcacion no llego a hacerse
// (ej. "primero marca tu entrada"), para que pueda reintentar.
async function liberar(id) {
  await db('escaneos_qr').where({ id }).update({ usado_en: null });
}

module.exports = { VIGENCIA_MS, crear, validar, consumir, liberar };
