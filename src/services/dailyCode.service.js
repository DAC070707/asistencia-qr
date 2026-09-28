const crypto = require('crypto');
const db = require('../config/db');
const { hoyLima } = require('../utils/limaDate');

function generarToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Devuelve el codigo activo (permanente) de una sucursal; si no existe lo
// crea. No se filtra por fecha: el codigo no expira solo, asi que el activo
// de hoy puede haberse creado cualquier dia anterior.
async function obtenerOCrearCodigoDeHoy(empresaId, sucursalId) {
  const existente = await db('daily_codes').where({ sucursal_id: sucursalId, activo: true }).first();
  if (existente) return existente;

  const [creado] = await db('daily_codes')
    .insert({
      fecha: hoyLima(),
      empresa_id: empresaId,
      sucursal_id: sucursalId,
      token: generarToken(),
      activo: true
    })
    .returning('*');
  return creado;
}

// Invalida el codigo activo de UNA sucursal (sin importar que dia se creo) y
// crea uno nuevo. Las demas sucursales de la empresa no se tocan.
async function regenerarCodigoDeHoy(empresaId, sucursalId, adminId = null) {
  return db.transaction(async (trx) => {
    await trx('daily_codes').where({ sucursal_id: sucursalId, activo: true }).update({ activo: false });

    const [creado] = await trx('daily_codes')
      .insert({
        fecha: hoyLima(),
        empresa_id: empresaId,
        sucursal_id: sucursalId,
        token: generarToken(),
        activo: true,
        creado_por: adminId
      })
      .returning('*');
    return creado;
  });
}

// Valida un token contra los codigos activos de cualquier empresa/sucursal,
// sin importar la fecha en que se genero: el codigo es permanente hasta que un
// admin lo invalide. El token resuelve a la empresa y a la sucursal.
async function validarToken(token) {
  return db('daily_codes').where({ token, activo: true }).first();
}

module.exports = {
  obtenerOCrearCodigoDeHoy,
  regenerarCodigoDeHoy,
  validarToken
};
