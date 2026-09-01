const POLL_MS = 6000;

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

async function cargarQr() {
  const resp = await fetch('/api/admin/qr/today');
  if (!resp.ok) return;
  const data = await resp.json();
  document.getElementById('fecha-hoy').textContent = data.fecha;
  document.getElementById('url-checkin').textContent = data.url;
  document.getElementById('qr-img').src = '/api/admin/qr/today.png?t=' + Date.now();
}

async function cargarAsistenciaHoy() {
  const resp = await fetch('/api/admin/attendance/today');
  if (!resp.ok) return;
  const registros = await resp.json();

  const tbody = document.getElementById('tabla-hoy');
  document.getElementById('contador-hoy').textContent = `(${registros.length})`;

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aún nadie ha marcado asistencia</td></tr>';
    return;
  }

  tbody.innerHTML = registros
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.nombre)}</td><td>${escapeHtml(r.dni)}</td><td>${formatearHora(r.creado_en)}</td><td>${r.hora_salida ? formatearHora(r.hora_salida) : '—'}</td></tr>`
    )
    .join('');
}

document.getElementById('regenerar-btn').addEventListener('click', async () => {
  if (!confirm('Esto invalidará el código actual. ¿Continuar?')) return;
  const btn = document.getElementById('regenerar-btn');
  btn.disabled = true;
  try {
    await fetch('/api/admin/qr/regenerate', { method: 'POST' });
    await cargarQr();
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarQr();
cargarAsistenciaHoy();
setInterval(cargarAsistenciaHoy, POLL_MS);
