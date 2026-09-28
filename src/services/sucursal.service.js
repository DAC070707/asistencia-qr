const db = require('../config/db');

async function listar(empresaId, { incluirInactivas = false } = {}) {
  const query = db('sucursales').where({ empresa_id: empresaId });
  if (!incluirInactivas) query.andWhere({ activo: true });
  return query.orderBy('id', 'asc');
}

// La "Principal" es la sucursal activa mas antigua. Si por algun motivo la
// empresa no tiene ninguna (no deberia pasar), se crea una.
async function obtenerPrincipal(empresaId) {
  const existente = await db('sucursales')
    .where({ empresa_id: empresaId, activo: true })
    .orderBy('id', 'asc')
    .first();
  if (existente) return existente;

  const [creada] = await db('sucursales')
    .insert({ empresa_id: empresaId, nombre: 'Principal' })
    .returning('*');
  return creada;
}

// Devuelve la sucursal solo si pertenece a la empresa (aislamiento entre
// empresas: un id ajeno se comporta como inexistente).
async function obtenerDeEmpresa(sucursalId, empresaId) {
  if (!sucursalId) return null;
  return db('sucursales').where({ id: sucursalId, empresa_id: empresaId }).first();
}

// Resuelve el parametro opcional sucursal_id de una request admin: si viene,
// debe ser de la empresa; si no viene, es la Principal.
async function resolverParaAdmin(sucursalIdParam, empresaId) {
  if (sucursalIdParam === undefined || sucursalIdParam === null || sucursalIdParam === '') {
    return obtenerPrincipal(empresaId);
  }
  return obtenerDeEmpresa(Number(sucursalIdParam), empresaId);
}

async function crear(empresaId, { nombre }) {
  const [creada] = await db('sucursales')
    .insert({ empresa_id: empresaId, nombre: String(nombre).trim().slice(0, 120) })
    .returning('*');
  return creada;
}

module.exports = { listar, obtenerPrincipal, obtenerDeEmpresa, resolverParaAdmin, crear };
