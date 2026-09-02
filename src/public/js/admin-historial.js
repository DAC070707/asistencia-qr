function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatearHora(iso) {
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatearFecha(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso));
}

// Convierte un instante ISO a "YYYY-MM-DDTHH:mm" en hora de Lima, para
// precargar un <input type="datetime-local">.
function toLimaInputValue(iso) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(iso));
  const get = (t) => partes.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function hoyLimaISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function badgeEstado(estado) {
  const textos = { pendiente: '⏳ Pendiente', aprobado: '✅ Aprobado', rechazado: '❌ Rechazado' };
  return `<span class="badge badge-${estado}">${textos[estado] || estado}</span>`;
}

const desdeInput = document.getElementById('desde-input');
const hastaInput = document.getElementById('hasta-input');
const workerInput = document.getElementById('worker-input');
const tbody = document.getElementById('tabla-historial');
const exportLink = document.getElementById('export-link');

async function cargarWorkers() {
  const resp = await fetch('/api/admin/workers');
  if (!resp.ok) return;
  const workers = await resp.json();
  workerInput.innerHTML =
    '<option value="">Todos</option>' +
    workers
      .map((w) => `<option value="${w.id}">${escapeHtml(w.nombre)} (${escapeHtml(w.dni)})</option>`)
      .join('');
}

function paramsActuales() {
  const params = new URLSearchParams({ desde: desdeInput.value, hasta: hastaInput.value });
  if (workerInput.value) params.set('worker_id', workerInput.value);
  return params;
}

function actualizarExportLink() {
  exportLink.href = `/api/admin/attendance/export.csv?${paramsActuales().toString()}`;
}

function filaHtml(r) {
  const tieneExtra = Number(r.horas_extra_25) > 0 || Number(r.horas_extra_35) > 0;
  return `
    <tr data-id="${r.id}" data-entrada="${r.creado_en}" data-salida="${r.hora_salida || ''}">
      <td>${formatearFecha(r.fecha)}</td>
      <td>${escapeHtml(r.nombre)}</td>
      <td>${escapeHtml(r.dni)}</td>
      <td class="celda-entrada">${formatearHora(r.creado_en)}</td>
      <td class="celda-salida">${r.hora_salida ? formatearHora(r.hora_salida) : '—'}</td>
      <td>${Number(r.horas_extra_25).toFixed(2)}</td>
      <td>${Number(r.horas_extra_35).toFixed(2)}</td>
      <td class="celda-estado">${tieneExtra ? badgeEstado(r.horas_extra_estado) : '—'}</td>
      <td class="celda-acciones">
        <button type="button" class="boton-mini secundario editar-btn">Editar</button>
        ${
          tieneExtra && r.horas_extra_estado !== 'aprobado'
            ? '<button type="button" class="boton-mini aprobar-btn">Aprobar</button>'
            : ''
        }
        ${
          tieneExtra && r.horas_extra_estado !== 'rechazado'
            ? '<button type="button" class="boton-mini secundario rechazar-btn">Rechazar</button>'
            : ''
        }
      </td>
    </tr>`;
}

function filaEdicionHtml(fila) {
  const entrada = fila.dataset.entrada ? toLimaInputValue(fila.dataset.entrada) : '';
  const salida = fila.dataset.salida ? toLimaInputValue(fila.dataset.salida) : '';
  const nombre = fila.children[1].textContent;
  const dni = fila.children[2].textContent;
  const fecha = fila.children[0].textContent;

  fila.innerHTML = `
    <td>${escapeHtml(fecha)}</td>
    <td>${escapeHtml(nombre)}</td>
    <td>${escapeHtml(dni)}</td>
    <td><input type="datetime-local" class="input-entrada" value="${entrada}" /></td>
    <td><input type="datetime-local" class="input-salida" value="${salida}" /></td>
    <td colspan="2"></td>
    <td></td>
    <td class="celda-acciones">
      <button type="button" class="boton-mini guardar-btn">Guardar</button>
      <button type="button" class="boton-mini secundario cancelar-btn">Cancelar</button>
    </td>`;
}

async function buscar() {
  if (!desdeInput.value || !hastaInput.value) return;

  actualizarExportLink();
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';

  const resp = await fetch(`/api/admin/attendance?${paramsActuales().toString()}`);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    tbody.innerHTML = `<tr><td colspan="9">${data.error || 'Error al cargar'}</td></tr>`;
    return;
  }
  const registros = await resp.json();

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">Sin registros para este filtro</td></tr>';
    return;
  }

  tbody.innerHTML = registros.map(filaHtml).join('');
}

tbody.addEventListener('click', async (e) => {
  const fila = e.target.closest('tr');
  if (!fila) return;
  const id = fila.dataset.id;

  if (e.target.classList.contains('editar-btn')) {
    filaEdicionHtml(fila);
    return;
  }

  if (e.target.classList.contains('cancelar-btn')) {
    return buscar();
  }

  if (e.target.classList.contains('guardar-btn')) {
    const horaEntrada = fila.querySelector('.input-entrada').value;
    const horaSalida = fila.querySelector('.input-salida').value;
    e.target.disabled = true;
    e.target.textContent = 'Guardando...';
    await fetch(`/api/admin/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hora_entrada: horaEntrada, hora_salida: horaSalida || null })
    });
    return buscar();
  }

  if (e.target.classList.contains('aprobar-btn') || e.target.classList.contains('rechazar-btn')) {
    const estado = e.target.classList.contains('aprobar-btn') ? 'aprobado' : 'rechazado';
    e.target.disabled = true;
    await fetch(`/api/admin/attendance/${id}/horas-extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    });
    return buscar();
  }
});

document.getElementById('buscar-btn').addEventListener('click', buscar);
document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

desdeInput.value = hoyLimaISO();
hastaInput.value = hoyLimaISO();
cargarWorkers();
buscar();
