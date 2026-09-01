const crypto = require('crypto');
const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

function generarToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Devuelve el codigo activo de hoy de una empresa; si no existe lo crea
// (fallback perezoso, por si el cron de medianoche no llego a correr).
async function obtenerOCrearCodigoDeHoy(empresaId) {
  const fecha = hoyLima();

  const existente = await db('daily_codes').where({ fecha, empresa_id: empresaId, activo: true }).first();
  if (existente) return existente;

  const [creado] = await db('daily_codes')
    .insert({ fecha, empresa_id: empresaId, token: generarToken(), activo: true })
    .returning('*');
  return creado;
}

// Invalida el codigo activo de hoy de una empresa (si existe) y crea uno
// nuevo. admin_id es opcional (null cuando lo dispara el cron).
async function regenerarCodigoDeHoy(empresaId, adminId = null) {
  const fecha = hoyLima();

  return db.transaction(async (trx) => {
    await trx('daily_codes')
      .where({ fecha, empresa_id: empresaId, activo: true })
      .update({ activo: false });

    const [creado] = await trx('daily_codes')
      .insert({ fecha, empresa_id: empresaId, token: generarToken(), activo: true, creado_por: adminId })
      .returning('*');
    return creado;
  });
}

// Valida un token contra el codigo activo de HOY, para CUALQUIER empresa: el
// token en si mismo resuelve a que empresa pertenece (por eso la URL del QR
// no necesita llevar el id de empresa). Un token de un dia anterior nunca
// calzara porque ya no esta activo para la fecha de hoy.
async function validarToken(token) {
  const fecha = hoyLima();
  return db('daily_codes').where({ token, fecha, activo: true }).first();
}

// Regenera el codigo del dia para TODAS las empresas activas (usado por el cron
// de medianoche, que no tiene un admin/empresa especifico en contexto).
async function regenerarCodigoDeHoyParaTodasLasEmpresas() {
  const empresas = await db('empresas').where({ activo: true }).select('id');
  for (const { id } of empresas) {
    await regenerarCodigoDeHoy(id, null);
  }
}

module.exports = {
  obtenerOCrearCodigoDeHoy,
  regenerarCodigoDeHoy,
  validarToken,
  regenerarCodigoDeHoyParaTodasLasEmpresas
};
