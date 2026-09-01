const TIMEZONE = 'America/Lima';

// Peru esta en UTC-5 todo el año (sin horario de verano), pero calculamos
// via Intl para no depender de un offset fijo hardcodeado.
function hoyLima() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // YYYY-MM-DD
}

function horaLima(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(fecha);
}

module.exports = { hoyLima, horaLima, TIMEZONE };
