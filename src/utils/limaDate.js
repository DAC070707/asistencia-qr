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

function primerDiaMesLima() {
  return hoyLima().slice(0, 8) + '01';
}

// Para precargar un <input type="datetime-local"> con la hora de Lima de un instante.
function limaLocalInputValue(fecha) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(fecha));

  const get = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// Interpreta "YYYY-MM-DDTHH:mm" (de un input datetime-local) como hora de Lima
// y devuelve el instante real en UTC. Peru no tiene horario de verano, asi que
// el offset -05:00 es fijo todo el año.
function limaLocalInputToDate(valor) {
  return new Date(`${valor}:00-05:00`);
}

module.exports = {
  hoyLima,
  horaLima,
  primerDiaMesLima,
  limaLocalInputValue,
  limaLocalInputToDate,
  TIMEZONE
};
