const cron = require('node-cron');
const { regenerarCodigoDeHoyParaTodasLasEmpresas } = require('./dailyCode.service');
const { TIMEZONE } = require('../utils/limaDate');

// A las 00:00 hora de Lima, genera el codigo del nuevo dia para cada empresa
// activa. Es un respaldo proactivo; ademas hay un fallback perezoso en
// dailyCode.service para cuando el servidor estuvo caido justo a esa hora.
function iniciarScheduler() {
  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        await regenerarCodigoDeHoyParaTodasLasEmpresas();
        console.log('[scheduler] Codigo diario generado automaticamente para todas las empresas');
      } catch (err) {
        console.error('[scheduler] Error generando codigo diario:', err);
      }
    },
    { timezone: TIMEZONE }
  );
}

module.exports = { iniciarScheduler };
