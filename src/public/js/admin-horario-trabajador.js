function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function soloHora(valorTime) {
  return valorTime ? valorTime.slice(0, 5) : '';
}

function hoyLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function formatoFechaCorta(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const app = document.getElementById('app');
const workerId = app.dataset.workerId;
const fechaIngreso = app.dataset.fechaIngreso || '';

let plantillas = [];
let versiones = [];
let editandoId = null; // null = nuevo horario

const tablaVersiones = document.getElementById('tabla-versiones');
const editor = document.getElementById('editor');
const editorTitulo = document.getElementById('editor-titulo');
const editorError = document.getElementById('editor-error');
const vigenteDesdeInput = document.getElementById('vigente-desde-input');
const tablaSemanal = document.getElementById('tabla-semanal');
const bloqueSemanal = document.getElementById('bloque-semanal');
const bloqueRotativo = document.getElementById('bloque-rotativo');
const anclaInput = document.getElementById('ancla-input');
const pasosContainer = document.getElementById('pasos-container');
const bloqueCiclo = document.getElementById('bloque-ciclo');
const tipoTrabajador = app.dataset.tipoTrabajador || 'empleado';
let esObreroConfigurable = false; // obrero en una empresa que gestiona obreros

// ---------- Jornada atipica (N x M) ----------

const $ = (id) => document.getElementById(id);

function horaDecimal(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h + m / 60;
}

function horasNetas(entrada, salida, refrigerioMin) {
  const e = horaDecimal(entrada);
  const sa = horaDecimal(salida);
  if (e === null || sa === null) return 0;
  const bruto = sa > e ? sa - e : sa + 24 - e;
  return Math.max(0, bruto - (refrigerioMin || 0) / 60);
}

function leerCiclo() {
  const alterna = $('ciclo-alterna').checked;
  return {
    fechaInicio: $('ciclo-inicio').value,
    diasTrabajo: Number($('ciclo-trabajo').value),
    diasDescanso: Number($('ciclo-descanso').value),
    horaEntrada: $('ciclo-entrada').value,
    horaSalida: $('ciclo-salida').value,
    refrigerioMin: Number($('ciclo-refrigerio').value) || 0,
    diasTurnoDia: alterna ? Number($('ciclo-dias-dia').value) : null,
    nocheHoraEntrada: alterna ? $('ciclo-noche-entrada').value : null,
    nocheHoraSalida: alterna ? $('ciclo-noche-salida').value : null
  };
}

function llenarCiclo(c) {
  $('ciclo-trabajo').value = c.diasTrabajo;
  $('ciclo-descanso').value = c.diasDescanso;
  $('ciclo-inicio').value = c.fechaInicio;
  $('ciclo-entrada').value = c.horaEntrada;
  $('ciclo-salida').value = c.horaSalida;
  $('ciclo-refrigerio').value = c.refrigerioMin;
  const alterna = c.diasTurnoDia !== null && c.diasTurnoDia !== undefined;
  $('ciclo-alterna').checked = alterna;
  $('ciclo-dias-dia').value = alterna ? c.diasTurnoDia : Math.floor(c.diasTrabajo / 2);
  $('ciclo-noche-entrada').value = c.nocheHoraEntrada || '19:00';
  $('ciclo-noche-salida').value = c.nocheHoraSalida || '07:00';
  renderCicloInfo();
}

function turnoDelIndice(c, i) {
  if (i >= c.diasTrabajo) return null;
  return c.diasTurnoDia !== null && i >= c.diasTurnoDia ? 'noche' : 'dia';
}

// Promedio legal (art. 9 D.S. 008-2002-TR): horas del ciclo entre todos sus
// dias, incluidos los de descanso. Maximo 8 h diarias / 48 h semanales.
function resumenLegal(c) {
  let horas = 0;
  for (let i = 0; i < c.diasTrabajo; i++) {
    const noche = turnoDelIndice(c, i) === 'noche';
    horas += horasNetas(noche ? c.nocheHoraEntrada : c.horaEntrada, noche ? c.nocheHoraSalida : c.horaSalida, c.refrigerioMin);
  }
  const dias = c.diasTrabajo + c.diasDescanso;
  const diario = horas / dias;
  return { horas, dias, diario, semanal: diario * 7, excede: diario > 8 + 1e-9 || diario * 7 > 48 + 1e-9 };
}

const fmt = (n) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

function sumarDiasTxt(fechaTxt, n) {
  const d = new Date(`${fechaTxt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function renderCicloInfo() {
  $('ciclo-noche').hidden = !$('ciclo-alterna').checked;
  const c = leerCiclo();
  const legal = $('ciclo-legal');
  const cal = $('ciclo-calendario');
  if (!c.diasTrabajo || c.diasDescanso < 0 || !c.horaEntrada || !c.horaSalida || !c.fechaInicio) {
    legal.innerHTML = '';
    cal.innerHTML = '';
    return;
  }
  const r = resumenLegal(c);
  legal.innerHTML = `
    <div class="${r.excede ? 'error' : 'ciclo-legal-ok'}">
      <strong>${c.diasTrabajo}x${c.diasDescanso}:</strong> ${fmt(r.horas)} h netas de trabajo en un ciclo de ${r.dias} días ·
      promedio <b>${fmt(r.diario)} h diarias</b> y <b>${fmt(r.semanal)} h semanales</b>.
      ${
        r.excede
          ? '<br>Supera el promedio máximo legal (8 h diarias / 48 h semanales, art. 9 D.S. 008-2002-TR). Revísalo con tu contador: el exceso se considera sobretiempo.'
          : ' Dentro del promedio legal (máx. 8 h diarias / 48 h semanales).'
      }
    </div>`;

  // Calendario: los 2 primeros ciclos desde el dia de subida.
  const L = c.diasTrabajo + c.diasDescanso;
  const total = Math.min(2 * L, 84);
  const celdas = [];
  let mesAnterior = '';
  for (let i = 0; i < total; i++) {
    const fecha = sumarDiasTxt(c.fechaInicio, i);
    const turno = turnoDelIndice(c, i % L);
    const mes = fecha.slice(0, 7);
    const etiquetaMes = mes !== mesAnterior ? `<span class="cal-mes">${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][Number(fecha.slice(5, 7)) - 1]}</span>` : '';
    mesAnterior = mes;
    const clase = turno === 'noche' ? 'cal-noche' : turno === 'dia' ? 'cal-dia' : 'cal-descanso';
    const titulo = turno === 'noche' ? 'Trabajo (noche)' : turno === 'dia' ? 'Trabajo (día)' : 'Descanso';
    celdas.push(`<div class="cal-celda ${clase}" title="${formatoFechaCorta(fecha)} · ${titulo}">${etiquetaMes}${Number(fecha.slice(8, 10))}</div>`);
  }
  cal.innerHTML = `
    <div class="cal-leyenda"><span class="cal-celda cal-dia"></span> Trabajo día <span class="cal-celda cal-noche"></span> Trabajo noche <span class="cal-celda cal-descanso"></span> Descanso</div>
    <div class="cal-grilla">${celdas.join('')}</div>`;
}

['ciclo-trabajo', 'ciclo-descanso', 'ciclo-inicio', 'ciclo-entrada', 'ciclo-salida', 'ciclo-refrigerio', 'ciclo-alterna', 'ciclo-dias-dia', 'ciclo-noche-entrada', 'ciclo-noche-salida'].forEach((id) => {
  $(id).addEventListener('input', renderCicloInfo);
  $(id).addEventListener('change', renderCicloInfo);
});

function cicloPorDefecto() {
  return {
    fechaInicio: vigenteDesdeInput.value || hoyLima(),
    diasTrabajo: 14,
    diasDescanso: 7,
    horaEntrada: '07:00',
    horaSalida: '19:00',
    refrigerioMin: 60,
    diasTurnoDia: null,
    nocheHoraEntrada: '19:00',
    nocheHoraSalida: '07:00'
  };
}

function aplicarTipo(tipo) {
  document.querySelector(`input[name="tipo-horario"][value="${tipo}"]`).checked = true;
  mostrarBloque(tipo);
}

// Jornadas predefinidas de obrero.
document.getElementById('presets-obrero').addEventListener('click', (e) => {
  const preset = e.target.dataset?.preset;
  if (!preset) return;
  if (preset === '6x1' || preset === '5x2') {
    const descanso = preset === '6x1' ? [6] : [5, 6];
    renderSemanal(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dia_semana: d,
        libre: descanso.includes(d),
        hora_entrada: descanso.includes(d) ? null : '08:00',
        hora_salida: descanso.includes(d) ? null : '17:00'
      }))
    );
    aplicarTipo('semanal');
    return;
  }
  const actual = leerCiclo();
  const [trabajo, descanso] = preset === 'otra' ? [actual.diasTrabajo || 10, actual.diasDescanso || 5] : preset.split('x').map(Number);
  llenarCiclo({
    ...cicloPorDefecto(),
    ...(actual.horaEntrada ? { horaEntrada: actual.horaEntrada, horaSalida: actual.horaSalida, refrigerioMin: actual.refrigerioMin } : {}),
    fechaInicio: actual.fechaInicio || vigenteDesdeInput.value || hoyLima(),
    diasTrabajo: trabajo,
    diasDescanso: descanso
  });
  aplicarTipo('ciclo');
  if (preset === 'otra') $('ciclo-trabajo').focus();
});

// ---------- Lista de horarios ----------

// "Lun–Vie 09:00–19:00 · Sáb libre · Dom libre": agrupa dias seguidos iguales.
function resumenSemanal(semanal) {
  const porDia = {};
  (semanal || []).forEach((d) => {
    porDia[d.dia_semana] = d.libre ? 'libre' : `${soloHora(d.hora_entrada)}–${soloHora(d.hora_salida)}`;
  });
  const grupos = [];
  for (let dia = 0; dia < 7; dia++) {
    const valor = porDia[dia] || '—';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.valor === valor && ultimo.hasta === dia - 1) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, valor });
  }
  return grupos
    .map((g) => {
      const dias = g.desde === g.hasta ? DIAS_CORTOS[g.desde] : `${DIAS_CORTOS[g.desde]}–${DIAS_CORTOS[g.hasta]}`;
      return `${dias} ${g.valor}`;
    })
    .join(' · ');
}

function resumenRotacion(rotacion) {
  if (!rotacion || !rotacion.pasos.length) return 'Sin pasos';
  const nombres = rotacion.pasos.map((p) => p.plantilla_nombre).join(' → ');
  return `Ciclo de ${rotacion.pasos.length} día(s) desde ${formatoFechaCorta(rotacion.fechaAncla)}: ${nombres}`;
}

function resumenCiclo(v) {
  const c = v.ciclo;
  if (!c) return '—';
  let texto = `${c.diasTrabajo}x${c.diasDescanso} desde el ${formatoFechaCorta(c.fechaInicio)} · ${c.horaEntrada}–${c.horaSalida}`;
  if (c.diasTurnoDia !== null) texto += ` (${c.diasTurnoDia} días de día, luego noche ${c.nocheHoraEntrada}–${c.nocheHoraSalida})`;
  if (c.refrigerioMin) texto += ` · refrigerio ${c.refrigerioMin} min`;
  let html = escapeHtml(texto);
  if (v.legal) {
    html += v.legal.excedeSemanal || v.legal.excedeDiario
      ? ` <span class="badge badge-tarde" title="Promedio ${fmt(v.legal.promedioSemanal)} h semanales">Supera promedio legal</span>`
      : ` <span class="badge badge-a_tiempo" title="Promedio ${fmt(v.legal.promedioSemanal)} h semanales">Promedio legal OK</span>`;
  }
  return html;
}

const ESTADOS = {
  vigente: '<span class="badge badge-aprobado">Vigente</span>',
  programado: '<span class="badge badge-pendiente">Programado</span>',
  anterior: '<span class="badge" style="background:var(--border); color:var(--muted);">Anterior</span>'
};

function renderVersiones() {
  if (versiones.length === 0) {
    tablaVersiones.innerHTML =
      '<tr><td colspan="5">Sin horario asignado. No se calcularán horas extra, tardanzas ni inasistencias hasta que agregues uno.</td></tr>';
    return;
  }
  tablaVersiones.innerHTML = versiones
    .map(
      (v) => `
      <tr data-id="${v.id}">
        <td><strong>${formatoFechaCorta(v.vigenteDesde)}</strong></td>
        <td>${v.tipo === 'semanal' ? 'Semanal' : v.tipo === 'ciclo' ? 'Jornada atípica' : 'Rotativo'}</td>
        <td>${v.tipo === 'ciclo' ? resumenCiclo(v) : escapeHtml(v.tipo === 'semanal' ? resumenSemanal(v.semanal) : resumenRotacion(v.rotacion))}</td>
        <td>${ESTADOS[v.estado] || ''}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="boton-mini secundario editar-version-btn">Editar</button>
          <button type="button" class="boton-mini secundario eliminar-version-btn">Eliminar</button>
        </td>
      </tr>`
    )
    .join('');
}

tablaVersiones.addEventListener('click', async (e) => {
  const fila = e.target.closest('tr[data-id]');
  if (!fila) return;
  const version = versiones.find((v) => String(v.id) === fila.dataset.id);

  if (e.target.classList.contains('editar-version-btn')) {
    abrirEditor(version);
    return;
  }

  if (e.target.classList.contains('eliminar-version-btn')) {
    if (!confirm(`¿Eliminar el horario que aplica desde el ${formatoFechaCorta(version.vigenteDesde)}? Las horas extra de esas fechas se recalcularán.`)) {
      return;
    }
    const resp = await fetch(`/api/admin/workers/${workerId}/horarios/${version.id}`, { method: 'DELETE' });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'No se pudo eliminar el horario');
      return;
    }
    versiones = await resp.json();
    renderVersiones();
    if (editandoId === version.id) cerrarEditor();
  }
});

// ---------- Editor ----------

function mostrarBloque(tipo) {
  bloqueSemanal.hidden = tipo !== 'semanal';
  bloqueRotativo.hidden = tipo !== 'rotativo';
  bloqueCiclo.hidden = tipo !== 'ciclo';
  if (tipo === 'ciclo') renderCicloInfo();
}

function filaSemanalHtml(dia, datos) {
  const libre = datos?.libre || false;
  return `
    <tr data-dia="${dia}">
      <td>${DIAS[dia]}</td>
      <td><input type="checkbox" class="input-libre" ${libre ? 'checked' : ''} /></td>
      <td><input type="time" class="input-entrada" value="${soloHora(datos?.hora_entrada)}" ${libre ? 'disabled' : ''} /></td>
      <td><input type="time" class="input-salida" value="${soloHora(datos?.hora_salida)}" ${libre ? 'disabled' : ''} /></td>
    </tr>`;
}

function renderSemanal(semanal) {
  const porDia = {};
  (semanal || []).forEach((d) => {
    porDia[d.dia_semana] = d;
  });
  tablaSemanal.innerHTML = DIAS.map((_, dia) => filaSemanalHtml(dia, porDia[dia])).join('');
}

tablaSemanal.addEventListener('change', (e) => {
  if (!e.target.classList.contains('input-libre')) return;
  const fila = e.target.closest('tr');
  const libre = e.target.checked;
  fila.querySelector('.input-entrada').disabled = libre;
  fila.querySelector('.input-salida').disabled = libre;
});

function opcionesPlantillas(seleccionada) {
  return plantillas
    .map((p) => `<option value="${p.id}" ${String(p.id) === String(seleccionada) ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`)
    .join('');
}

function filaPasoHtml(plantillaId) {
  return `
    <div class="fila-acciones" style="margin-bottom:0;">
      <select class="input-paso-plantilla" style="flex:1; margin:0;">
        ${opcionesPlantillas(plantillaId)}
      </select>
      <button type="button" class="boton-mini secundario quitar-paso-btn">Quitar</button>
    </div>`;
}

function renderPasos(pasos) {
  if (!pasos || pasos.length === 0) {
    pasosContainer.innerHTML = filaPasoHtml(plantillas[0]?.id);
    return;
  }
  pasosContainer.innerHTML = [...pasos]
    .sort((a, b) => a.posicion - b.posicion)
    .map((p) => filaPasoHtml(p.plantilla_id))
    .join('');
}

document.getElementById('agregar-paso-btn').addEventListener('click', () => {
  pasosContainer.insertAdjacentHTML('beforeend', filaPasoHtml(plantillas[0]?.id));
});

pasosContainer.addEventListener('click', (e) => {
  if (!e.target.classList.contains('quitar-paso-btn')) return;
  if (pasosContainer.children.length <= 1) return; // al menos un paso
  e.target.closest('.fila-acciones').remove();
});

document.querySelectorAll('input[name="tipo-horario"]').forEach((radio) => {
  radio.addEventListener('change', () => mostrarBloque(radio.value));
});

// version: la que se edita, o null para un horario nuevo. Un horario nuevo
// parte del contenido del vigente (asi solo se cambia lo que difiere).
function abrirEditor(version) {
  editandoId = version ? version.id : null;
  editorError.innerHTML = '';

  const base = version || versiones.find((v) => v.estado === 'vigente') || versiones[0] || null;
  const tipo = base ? base.tipo : 'semanal';

  if (version) {
    editorTitulo.textContent = `Editar horario que aplica desde el ${formatoFechaCorta(version.vigenteDesde)}`;
    vigenteDesdeInput.value = version.vigenteDesde;
  } else {
    editorTitulo.textContent = 'Nuevo horario';
    vigenteDesdeInput.value = versiones.length === 0 && fechaIngreso ? fechaIngreso : hoyLima();
  }

  const mostrarObrero = esObreroConfigurable || tipo === 'ciclo';
  document.getElementById('opcion-ciclo').hidden = !mostrarObrero;
  document.getElementById('presets-obrero').hidden = !esObreroConfigurable;
  llenarCiclo(base?.ciclo ? base.ciclo : cicloPorDefecto());
  if (!version && !base?.ciclo) $('ciclo-inicio').value = vigenteDesdeInput.value;

  document.querySelector(`input[name="tipo-horario"][value="${tipo}"]`).checked = true;
  mostrarBloque(tipo);
  renderSemanal(base?.semanal);
  if (base?.rotacion) {
    anclaInput.value = base.rotacion.fechaAncla;
    renderPasos(base.rotacion.pasos);
  } else {
    anclaInput.value = vigenteDesdeInput.value;
    renderPasos(null);
  }

  editor.hidden = false;
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cerrarEditor() {
  editor.hidden = true;
  editandoId = null;
}

document.getElementById('nuevo-horario-btn').addEventListener('click', () => abrirEditor(null));
document.getElementById('cancelar-horario-btn').addEventListener('click', cerrarEditor);

document.getElementById('guardar-horario-btn').addEventListener('click', async () => {
  editorError.innerHTML = '';
  const tipo = document.querySelector('input[name="tipo-horario"]:checked')?.value;
  const body = { vigenteDesde: vigenteDesdeInput.value, tipo };

  if (tipo === 'semanal') {
    body.semanal = [...tablaSemanal.querySelectorAll('tr')].map((fila) => ({
      diaSemana: Number(fila.dataset.dia),
      libre: fila.querySelector('.input-libre').checked,
      horaEntrada: fila.querySelector('.input-entrada').value,
      horaSalida: fila.querySelector('.input-salida').value
    }));
  } else if (tipo === 'ciclo') {
    body.ciclo = leerCiclo();
  } else if (tipo === 'rotativo') {
    body.rotacion = {
      fechaAncla: anclaInput.value,
      pasos: [...pasosContainer.querySelectorAll('.input-paso-plantilla')].map((s) => Number(s.value))
    };
  }

  // Un horario nuevo con la misma fecha que uno existente lo reemplaza.
  if (!editandoId) {
    const mismaFecha = versiones.find((v) => v.vigenteDesde === body.vigenteDesde);
    if (mismaFecha && !confirm(`Ya hay un horario que aplica desde el ${formatoFechaCorta(body.vigenteDesde)}. ¿Reemplazarlo?`)) {
      return;
    }
  }

  const btn = document.getElementById('guardar-horario-btn');
  btn.disabled = true;
  try {
    const resp = await fetch(
      editandoId ? `/api/admin/workers/${workerId}/horarios/${editandoId}` : `/api/admin/workers/${workerId}/horarios`,
      {
        method: editandoId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      editorError.innerHTML = `<div class="error">${escapeHtml(data.error || 'No se pudo guardar el horario')}</div>`;
      return;
    }
    versiones = await resp.json();
    renderVersiones();
    cerrarEditor();
  } finally {
    btn.disabled = false;
  }
});

async function cargarTodo() {
  const [turnosResp, versionesResp, configResp] = await Promise.all([
    fetch('/api/admin/turnos'),
    fetch(`/api/admin/workers/${workerId}/horarios`),
    fetch('/api/admin/empresa/configuracion')
  ]);
  const config = configResp.ok ? await configResp.json() : {};
  esObreroConfigurable = Boolean(config.gestionaObreros) && tipoTrabajador === 'obrero';
  plantillas = turnosResp.ok ? await turnosResp.json() : [];
  document.getElementById('exc-plantilla').innerHTML =
    '<option value="">(horario ad-hoc)</option>' + opcionesPlantillas();

  versiones = versionesResp.ok ? await versionesResp.json() : [];
  renderVersiones();
}

// ---- Excepciones ----

const tablaExcepciones = document.getElementById('tabla-excepciones');

function detalleExcepcion(e) {
  if (e.libre) return 'Libre';
  if (e.plantilla_nombre) return escapeHtml(e.plantilla_nombre);
  return `${soloHora(e.hora_entrada) || '—'} - ${soloHora(e.hora_salida) || '—'}`;
}

async function cargarExcepciones() {
  const resp = await fetch(`/api/admin/workers/${workerId}/excepciones`);
  if (!resp.ok) {
    tablaExcepciones.innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>';
    return;
  }
  const excepciones = await resp.json();
  if (excepciones.length === 0) {
    tablaExcepciones.innerHTML = '<tr><td colspan="4">Sin excepciones registradas</td></tr>';
    return;
  }
  tablaExcepciones.innerHTML = excepciones
    .map(
      (e) => `
        <tr data-id="${e.id}">
          <td>${new Date(e.fecha).toISOString().slice(0, 10)}</td>
          <td>${detalleExcepcion(e)}</td>
          <td>${escapeHtml(e.motivo || '—')}</td>
          <td><button type="button" class="boton-mini secundario eliminar-excepcion-btn">Eliminar</button></td>
        </tr>`
    )
    .join('');
}

document.getElementById('excepcion-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('excepcion-error');
  errorBox.innerHTML = '';

  const body = {
    fecha: document.getElementById('exc-fecha').value,
    libre: document.getElementById('exc-libre').checked,
    plantillaId: document.getElementById('exc-plantilla').value || null,
    horaEntrada: document.getElementById('exc-entrada').value || null,
    horaSalida: document.getElementById('exc-salida').value || null,
    motivo: document.getElementById('exc-motivo').value || null
  };

  const resp = await fetch(`/api/admin/workers/${workerId}/excepciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo agregar la excepción'}</div>`;
    return;
  }

  e.target.reset();
  await cargarExcepciones();
});

tablaExcepciones.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('eliminar-excepcion-btn')) return;
  const fila = e.target.closest('tr');
  if (!confirm('¿Eliminar esta excepción?')) return;
  await fetch(`/api/admin/workers/${workerId}/excepciones/${fila.dataset.id}`, { method: 'DELETE' });
  await cargarExcepciones();
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarTodo();
cargarExcepciones();
