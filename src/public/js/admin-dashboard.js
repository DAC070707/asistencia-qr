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

document.getElementById('logo-btn').addEventListener('click', async () => {
  const input = document.getElementById('logo-input');
  const errorBox = document.getElementById('logo-error');
  const btn = document.getElementById('logo-btn');
  errorBox.innerHTML = '';

  if (!input.files || input.files.length === 0) {
    errorBox.innerHTML = '<div class="error">Elige un archivo primero</div>';
    return;
  }

  const formData = new FormData();
  formData.append('logo', input.files[0]);

  btn.disabled = true;
  try {
    const resp = await fetch('/api/admin/empresa/logo', { method: 'POST', body: formData });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo subir el logo'}</div>`;
      return;
    }
    const data = await resp.json();
    document.getElementById('logo-preview').src = data.url;
    document.getElementById('logo-preview').style.display = '';
    const wrapper = document.getElementById('dana-header-empresa');
    if (wrapper) wrapper.style.display = '';
    document.querySelectorAll('.empresa-logo-img').forEach((img) => {
      img.src = data.url;
      img.style.display = '';
    });
  } catch (err) {
    errorBox.innerHTML = '<div class="error">Error de conexion, intenta de nuevo.</div>';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

async function cargarConfiguracion() {
  const resp = await fetch('/api/admin/empresa/configuracion');
  if (!resp.ok) return;
  const data = await resp.json();
  document.getElementById('tolerancia-input').value = data.toleranciaEntradaMinutos;
}

document.getElementById('tolerancia-btn').addEventListener('click', async () => {
  const errorBox = document.getElementById('tolerancia-error');
  const btn = document.getElementById('tolerancia-btn');
  errorBox.innerHTML = '';
  btn.disabled = true;

  const toleranciaEntradaMinutos = document.getElementById('tolerancia-input').value;
  try {
    const resp = await fetch('/api/admin/empresa/configuracion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toleranciaEntradaMinutos })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo guardar'}</div>`;
      return;
    }
    btn.textContent = 'Guardado ✓';
    setTimeout(() => {
      btn.textContent = 'Guardar';
    }, 1500);
  } finally {
    btn.disabled = false;
  }
});

cargarQr();
cargarAsistenciaHoy();
cargarConfiguracion();
actualizarSaludoYFecha();
actualizarReloj();
setInterval(cargarAsistenciaHoy, POLL_MS);
setInterval(actualizarReloj, 1000);
