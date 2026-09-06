const { limaLocalInputToDate } = require('./limaDate');

const LIMITE_25 = 2; // primeras 2 horas extra van al 25%

function horaATexto(valor) {
  // Acepta "HH:MM:SS" (columna TIME de Postgres) o "HH:MM"
  if (!valor) return null;
  const [h, m] = String(valor).split(':').map(Number);
  return h + m / 60;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// horaEntrada/horaSalida: Date (instantes reales del marcado).
// horaEntradaProgramada/horaSalidaProgramada: "HH:MM:SS" del horario del trabajador.
function calcularHorasExtra({
  horaEntrada,
  horaSalida,
  horaEntradaProgramada,
  horaSalidaProgramada
}) {
  const entradaProg = horaATexto(horaEntradaProgramada);
  const salidaProg = horaATexto(horaSalidaProgramada);

  if (entradaProg === null || salidaProg === null || !horaEntrada || !horaSalida) {
    return { extra25: 0, extra35: 0 };
  }

  const horasProgramadas = salidaProg - entradaProg;
  const horasTrabajadas = (new Date(horaSalida) - new Date(horaEntrada)) / (1000 * 60 * 60);

  if (horasProgramadas <= 0 || horasTrabajadas <= 0) {
    return { extra25: 0, extra35: 0 };
  }

  const extraTotal = Math.max(0, horasTrabajadas - horasProgramadas);
  const extra25 = Math.min(LIMITE_25, extraTotal);
  const extra35 = Math.max(0, extraTotal - LIMITE_25);

  return { extra25: round2(extra25), extra35: round2(extra35) };
}

// Cuantas horas le faltan a un trabajador para llegar a su hora de salida
// programada. Se mide contra la hora de salida YA MARCADA si existe (asi se
// nota cuando alguien se fue antes de su horario, aunque el turno ya este
// cerrado), o contra el instante actual si todavia no marca salida (cuenta
// regresiva del turno en curso). null cuando no tiene horario configurado;
// 0 cuando ya llego o paso su hora de salida programada.
// fecha: la fecha (columna DATE) del registro de asistencia.
// horaSalida: instante real de salida, o null/undefined si aun no marca.
// horaSalidaProgramada: "HH:MM:SS" del horario del trabajador.
function calcularHorasPendientes({ fecha, horaSalida, horaSalidaProgramada }) {
  if (!horaSalidaProgramada) return null;

  const fechaTexto = new Date(fecha).toISOString().slice(0, 10);
  const horaTexto = String(horaSalidaProgramada).slice(0, 5);
  const finProgramado = limaLocalInputToDate(`${fechaTexto}T${horaTexto}`);

  const referencia = horaSalida ? new Date(horaSalida) : new Date();
  const pendienteHoras = (finProgramado - referencia) / (1000 * 60 * 60);
  return Math.max(0, round2(pendienteHoras));
}

// Tolerancia fija para la SALIDA (temprano/tarde) — la de la ENTRADA es
// configurable por empresa (empresas.tolerancia_entrada_minutos) y se recibe
// como parametro en clasificarEntrada.
const TOLERANCIA_SALIDA_MIN = 5;

// Hora del dia (decimal, hora de Lima) de un instante real, para compararla
// contra las horas programadas ("HH:MM:SS") con la misma escala que horaATexto.
function horaDecimalLima(instante) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(instante));
  const h = Number(partes.find((p) => p.type === 'hour').value);
  const m = Number(partes.find((p) => p.type === 'minute').value);
  return h + m / 60;
}

function minutosRedondeados(horasDecimal) {
  return Math.round(horasDecimal * 60);
}

// horario: el resultado de horarioService.resolverHorarioDelDia (o null).
// toleranciaMinutos: minutos de tolerancia de la empresa (obligatorio, sin
// default silencioso — se resuelve explicitamente con
// horarioService.obtenerToleranciaEmpresa antes de llamar esta funcion).
// Devuelve { estado: 'a_tiempo'|'tarde'|'fuera_de_horario'|null, minutos }.
// "minutos" es la tardanza exacta (solo cuando estado='tarde'), null si no aplica.
function clasificarEntrada({ horaReal, horario, toleranciaMinutos }) {
  if (typeof toleranciaMinutos !== 'number') {
    throw new Error('clasificarEntrada requiere toleranciaMinutos');
  }
  if (!horario) return { estado: null, minutos: null };
  if (horario.libre) return { estado: 'fuera_de_horario', minutos: null };
  const prog = horaATexto(horario.horaEntrada);
  if (prog === null) return { estado: null, minutos: null };

  const real = horaDecimalLima(horaReal);
  const diffMin = minutosRedondeados(real - prog);
  if (diffMin > toleranciaMinutos) return { estado: 'tarde', minutos: diffMin };
  return { estado: 'a_tiempo', minutos: null };
}

// Devuelve { estado: 'a_tiempo'|'temprano'|'tarde'|'fuera_de_horario'|null, minutos }.
function clasificarSalida({ horaReal, horario }) {
  if (!horario) return { estado: null, minutos: null };
  if (horario.libre) return { estado: 'fuera_de_horario', minutos: null };
  const prog = horaATexto(horario.horaSalida);
  if (prog === null) return { estado: null, minutos: null };

  const real = horaDecimalLima(horaReal);
  const diffMin = minutosRedondeados(real - prog);
  if (diffMin < -TOLERANCIA_SALIDA_MIN) return { estado: 'temprano', minutos: -diffMin };
  if (diffMin > TOLERANCIA_SALIDA_MIN) return { estado: 'tarde', minutos: diffMin };
  return { estado: 'a_tiempo', minutos: null };
}

module.exports = {
  calcularHorasExtra,
  calcularHorasPendientes,
  clasificarEntrada,
  clasificarSalida
};
