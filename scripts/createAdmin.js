// Uso: npm run create-admin
// Lee ADMIN_EMAIL y ADMIN_PASSWORD del .env y crea (o actualiza la password de)
// ese admin en la base de datos.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD en tu .env antes de correr este script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const emailNormalizado = email.toLowerCase();

  const existente = await db('admins').where({ email: emailNormalizado }).first();

  if (existente) {
    await db('admins').where({ id: existente.id }).update({ password_hash: passwordHash });
    console.log(`Password actualizada para el admin existente: ${emailNormalizado}`);
  } else {
    await db('admins').insert({ email: emailNormalizado, password_hash: passwordHash });
    console.log(`Admin creado: ${emailNormalizado}`);
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
