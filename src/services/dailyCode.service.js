const crypto = require('crypto');
const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

function generarToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Devuelve el codigo activo de hoy; si no existe lo crea (fallback perezoso,
// por si el cron de medianoche no llego a correr).
async function obtenerOCrearCodigoDeHoy() {
  const fecha = hoyLima();

  const existente = await db('daily_codes').where({ fecha, activo: true }).first();
  if (existente) return existente;

  const [creado] = await db('daily_codes')
    .insert({ fecha, token: generarToken(), activo: true })
    .returning('*');
  return creado;
}

// Invalida el codigo activo de hoy (si existe) y crea uno nuevo. admin_id es
// opcional (null cuando lo dispara el cron).
async function regenerarCodigoDeHoy(adminId = null) {
  const fecha = hoyLima();

  return db.transaction(async (trx) => {
    await trx('daily_codes').where({ fecha, activo: true }).update({ activo: false });

    const [creado] = await trx('daily_codes')
      .insert({ fecha, token: generarToken(), activo: true, creado_por: adminId })
      .returning('*');
    return creado;
  });
}

// Valida un token contra el codigo activo de HOY. Un token de un dia anterior
// nunca calzara porque ya no esta activo para la fecha de hoy.
async function validarToken(token) {
  const fecha = hoyLima();
  return db('daily_codes').where({ token, fecha, activo: true }).first();
}

module.exports = { obtenerOCrearCodigoDeHoy, regenerarCodigoDeHoy, validarToken };
