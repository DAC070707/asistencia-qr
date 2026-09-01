require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET', 'BASE_URL'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
}

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL.replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  timezone: 'America/Lima',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD
};
