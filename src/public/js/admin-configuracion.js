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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

// ---------- Sucursales ----------

const listaSucursales = document.getElementById('lista-sucursales');

function pillEstadoHtml(activa) {
  return activa
    ? '<span class="pill" data-pill style="background:var(--green-bg); color:var(--green);">● Verificación activa</span>'
    : '<span class="pill" data-pill style="background:var(--border); color:var(--muted);">○ Verificación inactiva</span>';
}

function sucursalHtml(s) {
  return `
    <div class="sucursal-bloque" data-id="${s.id}" style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px; margin-bottom:14px;">
      <div class="card-head" style="margin-bottom:10px;">
        <input type="text" class="suc-nombre" value="${escapeHtml(s.nombre)}" style="max-width:280px; margin:0; font-weight:700;" />
        <span class="suc-pill-wrap">${pillEstadoHtml(s.geolocalizacionActiva)}</span>
      </div>

      <label style="margin:0 0 6px;">Dirección (referencia)
        <input type="text" class="suc-direccion" value="${escapeHtml(s.direccion)}" placeholder="Av. Ejemplo 123, distrito" style="margin:0;" />
      </label>

      <div class="fila-acciones">
        <button type="button" class="secundario suc-usar-btn">📍 Usar mi ubicación actual</button>
        <label style="margin:0;">Latitud
          <input type="number" class="suc-lat" step="0.0000001" value="${s.lat ?? ''}" style="max-width:150px; margin:0;" />
        </label>
        <label style="margin:0;">Longitud
          <input type="number" class="suc-lng" step="0.0000001" value="${s.lng ?? ''}" style="max-width:150px; margin:0;" />
        </label>
      </div>

      <div class="fila-acciones" style="margin-bottom:0;">
        <label style="margin:0;">Radio permitido (metros)
          <input type="number" class="suc-radio" min="10" max="500" step="1" value="${s.radioMetros}" style="max-width:100px; margin:0;" />
        </label>
        <label style="margin:0; font-weight:500; text-transform:none; display:flex; align-items:center; gap:8px;">
          <input type="checkbox" class="suc-activa" ${s.geolocalizacionActiva ? 'checked' : ''} />
          Exigir verificación de ubicación al marcar
        </label>
        <button type="button" class="secundario suc-guardar-btn">Guardar</button>
      </div>
      <div class="suc-error"></div>
    </div>`;
}

async function cargarSucursales() {
  const resp = await fetch('/api/admin/sucursales');
  if (!resp.ok) return;
  const sucursales = await resp.json();
  listaSucursales.innerHTML = sucursales.map(sucursalHtml).join('');
}

listaSucursales.addEventListener('click', (e) => {
  const bloque = e.target.closest('.sucursal-bloque');
  if (!bloque) return;
  const errorBox = bloque.querySelector('.suc-error');

  if (e.target.classList.contains('suc-usar-btn')) {
    const btn = e.target;
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
        bloque.querySelector('.suc-lat').value = posicion.coords.latitude.toFixed(7);
        bloque.querySelector('.suc-lng').value = posicion.coords.longitude.toFixed(7);
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
    return;
  }

  if (e.target.classList.contains('suc-guardar-btn')) {
    guardarSucursal(bloque, e.target);
  }
});

async function guardarSucursal(bloque, btn) {
  const errorBox = bloque.querySelector('.suc-error');
  errorBox.innerHTML = '';
  btn.disabled = true;

  const activaCheck = bloque.querySelector('.suc-activa');
  const body = {
    nombre: bloque.querySelector('.suc-nombre').value,
    direccion: bloque.querySelector('.suc-direccion').value,
    lat: bloque.querySelector('.suc-lat').value,
    lng: bloque.querySelector('.suc-lng').value,
    radioMetros: bloque.querySelector('.suc-radio').value,
    geolocalizacionActiva: activaCheck.checked
  };

  try {
    const resp = await fetch(`/api/admin/sucursales/${bloque.dataset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo guardar'}</div>`;
      activaCheck.checked = !body.geolocalizacionActiva;
      return;
    }
    const data = await resp.json();
    bloque.querySelector('.suc-pill-wrap').innerHTML = pillEstadoHtml(data.geolocalizacionActiva);
    btn.textContent = 'Guardado ✓';
    setTimeout(() => {
      btn.textContent = 'Guardar';
    }, 1500);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('nueva-sucursal-btn').addEventListener('click', async () => {
  const input = document.getElementById('nueva-sucursal-nombre');
  const errorBox = document.getElementById('sucursales-error');
  errorBox.innerHTML = '';

  const resp = await fetch('/api/admin/sucursales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: input.value })
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo crear la sucursal'}</div>`;
    return;
  }
  input.value = '';
  await cargarSucursales();
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarConfiguracion();
cargarSucursales();
