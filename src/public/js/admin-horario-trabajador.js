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
        <td>${v.tipo === 'semanal' ? 'Semanal' : 'Rotativo'}</td>
        <td>${escapeHtml(v.tipo === 'semanal' ? resumenSemanal(v.semanal) : resumenRotacion(v.rotacion))}</td>
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
  const [turnosResp, versionesResp] = await Promise.all([
    fetch('/api/admin/turnos'),
    fetch(`/api/admin/workers/${workerId}/horarios`)
  ]);
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
