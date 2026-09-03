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

// Cuantas horas le faltan a un trabajador para completar su turno de HOY,
// segun su horario programado. null cuando no aplica (ya marco salida, o no
// tiene horario configurado); 0 cuando el turno programado ya deberia haber
// terminado pero todavia no marco salida.
// fecha: la fecha (columna DATE) del registro de asistencia.
// horaSalida: instante real de salida, o null/undefined si aun no marca.
// horaSalidaProgramada: "HH:MM:SS" del horario del trabajador.
function calcularHorasPendientes({ fecha, horaSalida, horaSalidaProgramada }) {
  if (horaSalida) return null;
  if (!horaSalidaProgramada) return null;

  const fechaTexto = new Date(fecha).toISOString().slice(0, 10);
  const horaTexto = String(horaSalidaProgramada).slice(0, 5);
  const finProgramado = limaLocalInputToDate(`${fechaTexto}T${horaTexto}`);

  const pendienteHoras = (finProgramado - new Date()) / (1000 * 60 * 60);
  return Math.max(0, round2(pendienteHoras));
}

module.exports = { calcularHorasExtra, calcularHorasPendientes };
