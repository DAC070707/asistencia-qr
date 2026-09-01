// Uso: npm run create-super-admin
// Lee SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD del .env y crea (o actualiza la
// password de) ese super-admin en la base de datos.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      'Define SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD en tu .env antes de correr este script.'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('SUPERADMIN_PASSWORD debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const emailNormalizado = email.toLowerCase();

  const existente = await db('super_admins').where({ email: emailNormalizado }).first();

  if (existente) {
    await db('super_admins').where({ id: existente.id }).update({ password_hash: passwordHash });
    console.log(`Password actualizada para el super-admin existente: ${emailNormalizado}`);
  } else {
    await db('super_admins').insert({ email: emailNormalizado, password_hash: passwordHash });
    console.log(`Super-admin creado: ${emailNormalizado}`);
  }

  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
