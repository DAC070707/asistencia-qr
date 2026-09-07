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

function iniciales(nombre) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

async function cargarAsistenciaHoy() {
  const resp = await fetch('/api/admin/attendance/today');
  if (!resp.ok) return;
  const registros = await resp.json();

  const tbody = document.getElementById('tabla-hoy');
  document.getElementById('contador-hoy').textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aún nadie ha marcado asistencia</td></tr>';
    return;
  }

  tbody.innerHTML = registros
    .map(
      (r) =>
        `<tr><td><div class="name-cell"><div class="name-avatar">${iniciales(r.nombre)}</div>${escapeHtml(r.nombre)}</div></td><td>${escapeHtml(r.dni)}</td><td>${formatearHora(r.creado_en)}</td><td>${r.hora_salida ? formatearHora(r.hora_salida) : '—'}</td></tr>`
    )
    .join('');
}

function saludoSegunHora(hora) {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function actualizarSaludoYFecha() {
  const ahora = new Date();
  document.getElementById('saludo').textContent = `${saludoSegunHora(ahora.getHours())}`;
  document.getElementById('fecha-larga').textContent = ahora.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function actualizarReloj() {
  const ahora = new Date();
  const h = ahora.getHours() % 12;
  const m = ahora.getMinutes();
  const s = ahora.getSeconds();
  document.getElementById('hand-hour').style.transform = `rotate(${h * 30 + m * 0.5}deg)`;
  document.getElementById('hand-minute').style.transform = `rotate(${m * 6}deg)`;
  document.getElementById('hand-second').style.transform = `rotate(${s * 6}deg)`;
  document.getElementById('clock-digital').textContent = ahora.toLocaleTimeString('es-PE', { hour12: false });
  document.getElementById('clock-date').textContent = ahora.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
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
actualizarSaludoYFecha();
actualizarReloj();
setInterval(cargarAsistenciaHoy, POLL_MS);
setInterval(actualizarReloj, 1000);
