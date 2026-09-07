function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function soloHora(valorTime) {
  return valorTime ? valorTime.slice(0, 5) : '';
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const workerId = document.getElementById('app').dataset.workerId;

let plantillas = [];

const tablaSemanal = document.getElementById('tabla-semanal');
const bloqueSemanal = document.getElementById('bloque-semanal');
const bloqueRotativo = document.getElementById('bloque-rotativo');
const sinHorarioMsg = document.getElementById('sin-horario-msg');
const anclaInput = document.getElementById('ancla-input');
const pasosContainer = document.getElementById('pasos-container');

function mostrarBloque(tipo) {
  bloqueSemanal.hidden = tipo !== 'semanal';
  bloqueRotativo.hidden = tipo !== 'rotativo';
  sinHorarioMsg.hidden = !!tipo;
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
  pasosContainer.innerHTML = pasos
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

async function cargarTodo() {
  const [turnosResp, horarioResp] = await Promise.all([
    fetch('/api/admin/turnos'),
    fetch(`/api/admin/workers/${workerId}/horario`)
  ]);
  plantillas = turnosResp.ok ? await turnosResp.json() : [];
  document.getElementById('exc-plantilla').innerHTML =
    '<option value="">(horario ad-hoc)</option>' + opcionesPlantillas();

  const horario = horarioResp.ok ? await horarioResp.json() : { tipoHorario: null };

  const radio = document.querySelector(`input[name="tipo-horario"][value="${horario.tipoHorario || ''}"]`);
  if (radio) radio.checked = true;
  mostrarBloque(horario.tipoHorario);

  renderSemanal(horario.semanal);
  if (horario.rotacion) {
    anclaInput.value = new Date(horario.rotacion.fechaAncla).toISOString().slice(0, 10);
    renderPasos(horario.rotacion.pasos);
  } else {
    anclaInput.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    renderPasos(null);
  }
}

async function guardarHorario(tipo, extra) {
  const resp = await fetch(`/api/admin/workers/${workerId}/horario`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, ...extra })
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    alert(data.error || 'No se pudo guardar el horario');
    return false;
  }
  return true;
}

document.querySelectorAll('input[name="tipo-horario"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (radio.value === '') await guardarHorario(null);
  });
});

document.getElementById('guardar-semanal-btn').addEventListener('click', async () => {
  const semanal = [...tablaSemanal.querySelectorAll('tr')].map((fila) => ({
    diaSemana: Number(fila.dataset.dia),
    libre: fila.querySelector('.input-libre').checked,
    horaEntrada: fila.querySelector('.input-entrada').value,
    horaSalida: fila.querySelector('.input-salida').value
  }));
  const ok = await guardarHorario('semanal', { semanal });
  if (ok) alert('Horario semanal guardado');
});

document.getElementById('guardar-rotacion-btn').addEventListener('click', async () => {
  const pasos = [...pasosContainer.querySelectorAll('.input-paso-plantilla')].map((s) => Number(s.value));
  const ok = await guardarHorario('rotativo', { rotacion: { fechaAncla: anclaInput.value, pasos } });
  if (ok) alert('Rotación guardada');
});

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
