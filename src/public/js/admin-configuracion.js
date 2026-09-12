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

function actualizarEstadoPill(activa) {
  const pill = document.getElementById('ubicacion-estado-pill');
  if (activa) {
    pill.textContent = '● Verificación activa';
    pill.style.background = 'var(--green-bg)';
    pill.style.color = 'var(--green)';
  } else {
    pill.textContent = '○ Verificación inactiva';
    pill.style.background = 'var(--border)';
    pill.style.color = 'var(--muted)';
  }
}

async function cargarConfiguracion() {
  const resp = await fetch('/api/admin/empresa/configuracion');
  if (!resp.ok) return;
  const data = await resp.json();
  document.getElementById('tolerancia-input').value = data.toleranciaEntradaMinutos;
  document.getElementById('ubicacion-direccion').value = data.direccion || '';
  document.getElementById('ubicacion-lat').value = data.lat ?? '';
  document.getElementById('ubicacion-lng').value = data.lng ?? '';
  document.getElementById('ubicacion-radio').value = data.radioMetros;
  document.getElementById('ubicacion-activa').checked = data.geolocalizacionActiva;
  actualizarEstadoPill(data.geolocalizacionActiva);
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

document.getElementById('ubicacion-usar-btn').addEventListener('click', () => {
  const errorBox = document.getElementById('ubicacion-error');
  const btn = document.getElementById('ubicacion-usar-btn');
  errorBox.innerHTML = '';

  if (!navigator.geolocation) {
    errorBox.innerHTML = '<div class="error">Tu navegador no soporta geolocalización.</div>';
    return;
  }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Obteniendo ubicación…';

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      document.getElementById('ubicacion-lat').value = posicion.coords.latitude.toFixed(7);
      document.getElementById('ubicacion-lng').value = posicion.coords.longitude.toFixed(7);
      btn.disabled = false;
      btn.textContent = textoOriginal;
    },
    () => {
      btn.disabled = false;
      btn.textContent = textoOriginal;
      errorBox.innerHTML =
        '<div class="error">No pudimos obtener tu ubicación. Revisa el permiso de ubicación del navegador.</div>';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

document.getElementById('ubicacion-btn').addEventListener('click', async () => {
  const errorBox = document.getElementById('ubicacion-error');
  const btn = document.getElementById('ubicacion-btn');
  errorBox.innerHTML = '';
  btn.disabled = true;

  const body = {
    direccion: document.getElementById('ubicacion-direccion').value,
    lat: document.getElementById('ubicacion-lat').value,
    lng: document.getElementById('ubicacion-lng').value,
    radioMetros: document.getElementById('ubicacion-radio').value,
    geolocalizacionActiva: document.getElementById('ubicacion-activa').checked
  };

  try {
    const resp = await fetch('/api/admin/empresa/configuracion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo guardar'}</div>`;
      document.getElementById('ubicacion-activa').checked = !body.geolocalizacionActiva;
      return;
    }
    const data = await resp.json();
    actualizarEstadoPill(data.geolocalizacionActiva);
    btn.textContent = 'Guardado ✓';
    setTimeout(() => {
      btn.textContent = 'Guardar';
    }, 1500);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarConfiguracion();
