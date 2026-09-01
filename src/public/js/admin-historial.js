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

const fechaInput = document.getElementById('fecha-input');
const tbody = document.getElementById('tabla-historial');
const exportLink = document.getElementById('export-link');

function actualizarExportLink(fecha) {
  exportLink.href = `/api/admin/attendance/export.csv?fecha=${fecha}`;
}

function filaHtml(r) {
  const tieneExtra = Number(r.horas_extra_25) > 0 || Number(r.horas_extra_35) > 0;
  return `
    <tr data-id="${r.id}" data-entrada="${r.creado_en}" data-salida="${r.hora_salida || ''}">
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
  const id = fila.dataset.id;
  const entrada = fila.dataset.entrada ? toLimaInputValue(fila.dataset.entrada) : '';
  const salida = fila.dataset.salida ? toLimaInputValue(fila.dataset.salida) : '';
  const nombre = fila.children[0].textContent;
  const dni = fila.children[1].textContent;

  fila.innerHTML = `
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
  const fecha = fechaInput.value;
  if (!fecha) return;

  actualizarExportLink(fecha);
  tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';

  const resp = await fetch(`/api/admin/attendance?fecha=${fecha}`);
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="8">Error al cargar</td></tr>';
    return;
  }
  const registros = await resp.json();

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Sin registros para esta fecha</td></tr>';
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

fechaInput.value = hoyLimaISO();
buscar();
