const crypto = require('crypto');
const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

function generarToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Devuelve el codigo activo (permanente) de una empresa; si no existe lo crea.
// No se filtra por fecha: el codigo no expira solo, asi que el activo de hoy
// puede haberse creado cualquier dia anterior.
async function obtenerOCrearCodigoDeHoy(empresaId) {
  const existente = await db('daily_codes').where({ empresa_id: empresaId, activo: true }).first();
  if (existente) return existente;

  const [creado] = await db('daily_codes')
    .insert({ fecha: hoyLima(), empresa_id: empresaId, token: generarToken(), activo: true })
    .returning('*');
  return creado;
}

// Invalida el codigo activo de una empresa (sin importar que dia se creo) y
// crea uno nuevo. admin_id es opcional (null cuando lo dispara un proceso sin
// admin en contexto).
async function regenerarCodigoDeHoy(empresaId, adminId = null) {
  return db.transaction(async (trx) => {
    await trx('daily_codes').where({ empresa_id: empresaId, activo: true }).update({ activo: false });

    const [creado] = await trx('daily_codes')
      .insert({ fecha: hoyLima(), empresa_id: empresaId, token: generarToken(), activo: true, creado_por: adminId })
      .returning('*');
    return creado;
  });
}

// Valida un token contra el codigo activo de la empresa que sea, sin importar
// la fecha en que se genero: el codigo ya no expira solo, es permanente hasta
// que un admin lo invalide manualmente. El token en si mismo resuelve a que
// empresa pertenece (por eso la URL del QR no necesita llevar el id de empresa).
async function validarToken(token) {
  return db('daily_codes').where({ token, activo: true }).first();
}

module.exports = {
  obtenerOCrearCodigoDeHoy,
  regenerarCodigoDeHoy,
  validarToken
};
