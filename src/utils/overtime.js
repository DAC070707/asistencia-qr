const { limaLocalInputToDate } = require('./limaDate');

const LIMITE_25 = 2; // primeras 2 horas extra van al primer tramo (25% / 60%...)
const MS_MIN = 60 * 1000;
const MS_HORA = 60 * MS_MIN;

function horaATexto(valor) {
  // Acepta "HH:MM:SS" (columna TIME de Postgres) o "HH:MM"
  if (!valor) return null;
  const [h, m] = String(valor).split(':').map(Number);
  return h + m / 60;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function soloFecha(valor) {
  return typeof valor === 'string' ? valor.slice(0, 10) : new Date(valor).toISOString().slice(0, 10);
}

function sumarDias(fechaTxt, n) {
  const d = new Date(`${fechaTxt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Instante truncado al minuto (la marcacion se evalua por minutos, igual que
// la hora del dia que se muestra).
function alMinuto(instante) {
  return Math.floor(new Date(instante).getTime() / MS_MIN) * MS_MIN;
}

// true si el turno termina al dia siguiente (turno noche): lo indica la
// plantilla, o la hora de salida es menor o igual a la de entrada.
function cruzaMedianoche(horario) {
  if (!horario || horario.libre) return false;
  if (horario.cruzaMedianoche) return true;
  const e = horaATexto(horario.horaEntrada);
  const s = horaATexto(horario.horaSalida);
  return e !== null && s !== null && s <= e;
}

// Instante de la salida programada del turno que EMPIEZA en "fecha".
function instanteSalidaProgramada(fecha, horaSalidaProgramada, cruza) {
  const dia = cruza ? sumarDias(soloFecha(fecha), 1) : soloFecha(fecha);
  return limaLocalInputToDate(`${dia}T${String(horaSalidaProgramada).slice(0, 5)}`).getTime();
}

function separarTramos(extraTotal) {
  const extra25 = Math.min(LIMITE_25, extraTotal);
  const extra35 = Math.max(0, extraTotal - LIMITE_25);
  return { extra25: round2(extra25), extra35: round2(extra35) };
}

// horaSalida: Date (instante real de la salida marcada).
// horaSalidaProgramada: "HH:MM:SS" del horario del trabajador.
// fecha / cruzaMedianoche: fecha del registro (dia en que empezo el turno) y
// si el turno termina al dia siguiente. Con la fecha se compara contra el
// instante real de la salida programada, asi el turno noche se calcula bien.
// Se mide unicamente contra la hora de salida programada, sin relacionarla con
// la hora de entrada: si entro tarde no le resta de la hora extra.
// extra25 / extra35 = horas del primer tramo (2 primeras) y del segundo.
function calcularHorasExtra({ horaSalida, horaSalidaProgramada, fecha, cruzaMedianoche: cruza }) {
  const salidaProg = horaATexto(horaSalidaProgramada);
  if (salidaProg === null || !horaSalida) {
    return { extra25: 0, extra35: 0 };
  }

  if (fecha) {
    const prog = instanteSalidaProgramada(fecha, horaSalidaProgramada, !!cruza);
    return separarTramos(Math.max(0, (alMinuto(horaSalida) - prog) / MS_HORA));
  }

  const real = horaDecimalLima(horaSalida);
  return separarTramos(Math.max(0, real - salidaProg));
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
// cruzaMedianoche: el turno termina al dia siguiente.
function calcularHorasPendientes({ fecha, horaSalida, horaSalidaProgramada, cruzaMedianoche: cruza }) {
  if (!horaSalidaProgramada) return null;

  const finProgramado = instanteSalidaProgramada(fecha, horaSalidaProgramada, !!cruza);
  const referencia = horaSalida ? new Date(horaSalida).getTime() : Date.now();
  const pendienteHoras = (finProgramado - referencia) / MS_HORA;
  return Math.max(0, round2(pendienteHoras));
}

// Horas trabajadas dentro del horario nocturno (22:00 a 06:00, hora de Lima)
// entre la entrada y la salida reales.
function calcularHorasNocturnas({ horaEntrada, horaSalida }) {
  if (!horaEntrada || !horaSalida) return 0;
  const inicio = alMinuto(horaEntrada);
  const fin = alMinuto(horaSalida);
  if (fin <= inicio) return 0;

  let total = 0;
  let dia = sumarDias(limaFecha(inicio), -1);
  const ultimo = limaFecha(fin);
  while (dia <= ultimo) {
    const desde = limaLocalInputToDate(`${dia}T22:00`).getTime();
    const hasta = limaLocalInputToDate(`${sumarDias(dia, 1)}T06:00`).getTime();
    total += Math.max(0, Math.min(fin, hasta) - Math.max(inicio, desde));
    dia = sumarDias(dia, 1);
  }
  return round2(total / MS_HORA);
}

function limaFecha(instante) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(instante));
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
// "minutos" es el EXCESO sobre la tolerancia (solo cuando estado='tarde'),
// null si no aplica. Ej: entrada programada 10:00, tolerancia 5 min, llego
// 10:06 -> tarde, minutos: 1 (6 min de retraso - 5 de tolerancia).
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
  if (diffMin > toleranciaMinutos) return { estado: 'tarde', minutos: diffMin - toleranciaMinutos };
  return { estado: 'a_tiempo', minutos: null };
}

// Devuelve { estado: 'a_tiempo'|'temprano'|'tarde'|'fuera_de_horario'|null, minutos }.
// Con "fecha" (dia en que empezo el turno) compara contra el instante real de
// la salida programada, necesario para el turno noche.
function clasificarSalida({ horaReal, horario, fecha }) {
  if (!horario) return { estado: null, minutos: null };
  if (horario.libre) return { estado: 'fuera_de_horario', minutos: null };
  const prog = horaATexto(horario.horaSalida);
  if (prog === null) return { estado: null, minutos: null };

  const diffMin = fecha
    ? Math.round(
        (alMinuto(horaReal) - instanteSalidaProgramada(fecha, horario.horaSalida, cruzaMedianoche(horario))) / MS_MIN
      )
    : minutosRedondeados(horaDecimalLima(horaReal) - prog);
  if (diffMin < -TOLERANCIA_SALIDA_MIN) return { estado: 'temprano', minutos: -diffMin };
  if (diffMin > TOLERANCIA_SALIDA_MIN) return { estado: 'tarde', minutos: diffMin };
  return { estado: 'a_tiempo', minutos: null };
}

module.exports = {
  horaATexto,
  sumarDias,
  cruzaMedianoche,
  calcularHorasExtra,
  calcularHorasPendientes,
  calcularHorasNocturnas,
  clasificarEntrada,
  clasificarSalida
};
