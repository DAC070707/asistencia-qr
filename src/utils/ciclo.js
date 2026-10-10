// Jornadas acumulativas / atipicas (N x M): N dias de trabajo seguidos de M
// de descanso, repitiendose desde fecha_inicio. Opcionalmente los primeros
// diasTurnoDia dias de trabajo son de dia y el resto de noche.
//
// Promedio legal (art. 9 D.S. 008-2002-TR): horas trabajadas del ciclo entre
// TODOS los dias del ciclo (incluidos los de descanso); no puede superar
// 8 h diarias ni 48 h semanales.

const MAX_PROMEDIO_DIARIO = 8;
const MAX_PROMEDIO_SEMANAL = 48;

function soloFecha(valor) {
  return typeof valor === 'string' ? valor.slice(0, 10) : new Date(valor).toISOString().slice(0, 10);
}

function diasEntre(desdeTxt, hastaTxt) {
  return Math.round((new Date(`${hastaTxt}T00:00:00Z`) - new Date(`${desdeTxt}T00:00:00Z`)) / 86400000);
}

function sumarDias(fechaTxt, n) {
  const d = new Date(`${fechaTxt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function horaDecimal(valor) {
  if (!valor) return null;
  const [h, m] = String(valor).split(':').map(Number);
  return h + m / 60;
}

// Fila de horario_ciclos -> objeto normalizado.
function desdeFila(fila) {
  if (!fila) return null;
  return {
    fechaInicio: soloFecha(fila.fecha_inicio),
    diasTrabajo: Number(fila.dias_trabajo),
    diasDescanso: Number(fila.dias_descanso),
    horaEntrada: String(fila.hora_entrada).slice(0, 5),
    horaSalida: String(fila.hora_salida).slice(0, 5),
    refrigerioMin: Number(fila.refrigerio_min) || 0,
    diasTurnoDia: fila.dias_turno_dia === null || fila.dias_turno_dia === undefined ? null : Number(fila.dias_turno_dia),
    nocheHoraEntrada: fila.noche_hora_entrada ? String(fila.noche_hora_entrada).slice(0, 5) : null,
    nocheHoraSalida: fila.noche_hora_salida ? String(fila.noche_hora_salida).slice(0, 5) : null
  };
}

function largo(ciclo) {
  return ciclo.diasTrabajo + ciclo.diasDescanso;
}

// Posicion de una fecha dentro de su ciclo. "numero" puede ser negativo
// (fechas anteriores a fecha_inicio siguen el mismo patron hacia atras).
function posicionEnCiclo(ciclo, fecha) {
  const L = largo(ciclo);
  const dias = diasEntre(ciclo.fechaInicio, soloFecha(fecha));
  const indice = ((dias % L) + L) % L;
  const numero = Math.floor(dias / L);
  const trabaja = indice < ciclo.diasTrabajo;
  let turno = null;
  if (trabaja) {
    turno = ciclo.diasTurnoDia !== null && indice >= ciclo.diasTurnoDia ? 'noche' : 'dia';
  }
  return { indice, numero, inicio: sumarDias(ciclo.fechaInicio, numero * L), trabaja, turno };
}

function horasDeTurno(ciclo, turno) {
  return turno === 'noche'
    ? { entrada: ciclo.nocheHoraEntrada, salida: ciclo.nocheHoraSalida }
    : { entrada: ciclo.horaEntrada, salida: ciclo.horaSalida };
}

// Horario del dia (mismo formato que resolverHorarioDelDia).
function horarioDeCiclo(ciclo, fecha) {
  const pos = posicionEnCiclo(ciclo, fecha);
  if (!pos.trabaja) return { libre: true, horaEntrada: null, horaSalida: null, turno: null };
  const { entrada, salida } = horasDeTurno(ciclo, pos.turno);
  const e = horaDecimal(entrada);
  const s = horaDecimal(salida);
  return {
    libre: false,
    horaEntrada: `${entrada}:00`,
    horaSalida: `${salida}:00`,
    cruzaMedianoche: s <= e,
    turno: pos.turno,
    refrigerioMin: ciclo.refrigerioMin
  };
}

// Horas netas de una jornada programada (descontando refrigerio).
function horasNetas(entrada, salida, refrigerioMin) {
  const e = horaDecimal(entrada);
  const s = horaDecimal(salida);
  if (e === null || s === null) return 0;
  const bruto = s > e ? s - e : s + 24 - e;
  return Math.max(0, bruto - (refrigerioMin || 0) / 60);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Horas programadas del ciclo y su promedio legal.
function resumenLegal(ciclo) {
  let horasCiclo = 0;
  for (let i = 0; i < ciclo.diasTrabajo; i++) {
    const turno = ciclo.diasTurnoDia !== null && i >= ciclo.diasTurnoDia ? 'noche' : 'dia';
    const { entrada, salida } = horasDeTurno(ciclo, turno);
    horasCiclo += horasNetas(entrada, salida, ciclo.refrigerioMin);
  }
  const diasCiclo = largo(ciclo);
  const promedioDiario = horasCiclo / diasCiclo;
  const promedioSemanal = promedioDiario * 7;
  return {
    diasCiclo,
    horasCiclo: round2(horasCiclo),
    promedioDiario: round2(promedioDiario),
    promedioSemanal: round2(promedioSemanal),
    excedeDiario: promedioDiario > MAX_PROMEDIO_DIARIO + 1e-9,
    excedeSemanal: promedioSemanal > MAX_PROMEDIO_SEMANAL + 1e-9
  };
}

module.exports = {
  MAX_PROMEDIO_DIARIO,
  MAX_PROMEDIO_SEMANAL,
  desdeFila,
  largo,
  posicionEnCiclo,
  horarioDeCiclo,
  horasNetas,
  resumenLegal,
  sumarDias,
  diasEntre
};
