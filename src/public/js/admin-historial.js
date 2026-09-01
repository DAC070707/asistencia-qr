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

function hoyLimaISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

const fechaInput = document.getElementById('fecha-input');
const tbody = document.getElementById('tabla-historial');
const exportLink = document.getElementById('export-link');

function actualizarExportLink(fecha) {
  exportLink.href = `/api/admin/attendance/export.csv?fecha=${fecha}`;
}

async function buscar() {
  const fecha = fechaInput.value;
  if (!fecha) return;

  actualizarExportLink(fecha);
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

  const resp = await fetch(`/api/admin/attendance?fecha=${fecha}`);
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="3">Error al cargar</td></tr>';
    return;
  }
  const registros = await resp.json();

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Sin registros para esta fecha</td></tr>';
    return;
  }

  tbody.innerHTML = registros
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.nombre)}</td><td>${escapeHtml(r.dni)}</td><td>${formatearHora(r.creado_en)}</td><td>${r.hora_salida ? formatearHora(r.hora_salida) : '—'}</td></tr>`
    )
    .join('');
}

document.getElementById('buscar-btn').addEventListener('click', buscar);
document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

fechaInput.value = hoyLimaISO();
buscar();
