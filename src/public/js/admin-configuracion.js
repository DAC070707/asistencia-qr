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
  div.textContent = str ?? '';
  return div.innerHTML;
}

const GOOGLE_MAPS_KEY = window.DANA_GOOGLE_MAPS_KEY || null;

async function cargarConfiguracion() {
  const resp = await fetch('/api/admin/empresa/configuracion');
  if (!resp.ok) return;
  const data = await resp.json();
  document.getElementById('tolerancia-input').value = data.toleranciaEntradaMinutos;
  document.getElementById('refrigerio-activo').checked = data.controlaRefrigerio;
}

document.getElementById('refrigerio-btn').addEventListener('click', async () => {
  const errorBox = document.getElementById('refrigerio-error');
  const btn = document.getElementById('refrigerio-btn');
  errorBox.innerHTML = '';
  btn.disabled = true;
  try {
    const resp = await fetch('/api/admin/empresa/configuracion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlaRefrigerio: document.getElementById('refrigerio-activo').checked })
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

      ${
        GOOGLE_MAPS_KEY
          ? `<div class="suc-mapa-wrap">
               <div class="suc-buscador"></div>
               <div class="suc-mapa"></div>
               <p class="card-sub" style="margin:6px 0 0;">Arrastra el pin o toca el mapa para fijar la puerta del local.</p>
             </div>`
          : ''
      }

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
  if (GOOGLE_MAPS_KEY) {
    listaSucursales.querySelectorAll('.sucursal-bloque').forEach((bloque) => {
      iniciarMapaSucursal(bloque).catch((err) => {
        console.error('No se pudo cargar el mapa:', err);
        const wrap = bloque.querySelector('.suc-mapa-wrap');
        if (wrap) wrap.innerHTML = '<div class="error">No se pudo cargar el mapa de Google. Puedes usar latitud y longitud.</div>';
      });
    });
  }
}

// ---------- Mapa de Google (solo si hay API key) ----------

const CENTRO_LIMA = { lat: -12.0464, lng: -77.0428 };
let googleMapsPromesa = null;

function cargarGoogleMaps() {
  if (googleMapsPromesa) return googleMapsPromesa;
  googleMapsPromesa = new Promise((resolve, reject) => {
    window.__danaMapsListo = () => resolve(window.google);
    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js?key=' +
      encodeURIComponent(GOOGLE_MAPS_KEY) +
      '&v=weekly&language=es&region=PE&loading=async&callback=__danaMapsListo';
    script.async = true;
    script.onerror = () => reject(new Error('No se pudo descargar Google Maps'));
    document.head.appendChild(script);
  });
  return googleMapsPromesa;
}

async function iniciarMapaSucursal(bloque) {
  const google = await cargarGoogleMaps();
  const { Map, Circle } = await google.maps.importLibrary('maps');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

  const latInput = bloque.querySelector('.suc-lat');
  const lngInput = bloque.querySelector('.suc-lng');
  const radioInput = bloque.querySelector('.suc-radio');
  const direccionInput = bloque.querySelector('.suc-direccion');

  const tieneUbicacion = latInput.value !== '' && lngInput.value !== '';
  const posicionInicial = tieneUbicacion
    ? { lat: Number(latInput.value), lng: Number(lngInput.value) }
    : CENTRO_LIMA;

  const mapa = new Map(bloque.querySelector('.suc-mapa'), {
    center: posicionInicial,
    zoom: tieneUbicacion ? 18 : 12,
    mapId: 'DEMO_MAP_ID',
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
    gestureHandling: 'cooperative'
  });

  const pin = new AdvancedMarkerElement({
    map: tieneUbicacion ? mapa : null,
    position: posicionInicial,
    gmpDraggable: true,
    title: 'Puerta del local'
  });

  const circulo = new Circle({
    map: tieneUbicacion ? mapa : null,
    center: posicionInicial,
    radius: Number(radioInput.value) || 50,
    strokeColor: '#2f6fed',
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillColor: '#2f6fed',
    fillOpacity: 0.12,
    clickable: false
  });

  function moverA(pos, { centrar = false, zoom = null } = {}) {
    const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
    const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
    latInput.value = lat.toFixed(7);
    lngInput.value = lng.toFixed(7);
    pin.position = { lat, lng };
    pin.map = mapa;
    circulo.setCenter({ lat, lng });
    circulo.setMap(mapa);
    if (centrar) mapa.panTo({ lat, lng });
    if (zoom) mapa.setZoom(zoom);
  }

  pin.addListener('dragend', () => moverA(pin.position));
  mapa.addListener('click', (e) => moverA(e.latLng));

  function desdeCampos() {
    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);
    if (latInput.value === '' || lngInput.value === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    moverA({ lat, lng }, { centrar: true });
  }
  latInput.addEventListener('change', desdeCampos);
  lngInput.addEventListener('change', desdeCampos);
  radioInput.addEventListener('input', () => circulo.setRadius(Number(radioInput.value) || 0));

  // "Usar mi ubicacion actual" avisa a traves de este evento para mover el pin.
  bloque.addEventListener('dana:ubicacion', () => desdeCampos());

  // Buscador de direcciones (Places API New), limitado a Peru.
  try {
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    const buscador = new PlaceAutocompleteElement({ includedRegionCodes: ['pe'] });
    buscador.setAttribute('placeholder', 'Buscar dirección del local…');
    bloque.querySelector('.suc-buscador').appendChild(buscador);

    async function alElegir(place) {
      if (!place) return;
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
      if (!place.location) return;
      moverA(place.location, { centrar: true, zoom: 19 });
      if (place.formattedAddress) direccionInput.value = place.formattedAddress;
    }
    buscador.addEventListener('gmp-select', (e) => alElegir(e.placePrediction?.toPlace()));
    buscador.addEventListener('gmp-placeselect', (e) => alElegir(e.place));
  } catch (err) {
    console.error('Buscador de direcciones no disponible:', err);
  }
}

// ---------- Intentos rechazados ----------

const MOTIVOS_INTENTO = {
  sin_permiso: 'Permiso de ubicación bloqueado',
  sin_senal: 'Sin señal de ubicación',
  tiempo_agotado: 'Tardó demasiado en ubicarse',
  fuera_de_rango: 'Fuera del radio',
  sin_ubicacion: 'No envió ubicación',
  navegador_sin_soporte: 'Navegador sin ubicación'
};
const ACCIONES_INTENTO = {
  entrada: 'Entrada',
  salida: 'Salida',
  refrigerio_salida: 'Salida refrigerio',
  refrigerio_regreso: 'Regreso refrigerio'
};
const DISPOSITIVOS = { iphone: 'iPhone', android: 'Android', otro: 'Otro' };

function fechaHoraLima(valor) {
  return new Date(valor).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function metros(valor) {
  return valor === null || valor === undefined ? '—' : `${Math.round(Number(valor))} m`;
}

async function cargarIntentos() {
  const tbody = document.getElementById('tabla-intentos');
  const resp = await fetch('/api/admin/intentos-rechazados');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="8">No se pudo cargar.</td></tr>';
    return;
  }
  const intentos = await resp.json();
  if (intentos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Sin intentos rechazados en los últimos 7 días.</td></tr>';
    return;
  }
  tbody.innerHTML = intentos
    .map(
      (i) => `
      <tr>
        <td>${fechaHoraLima(i.creado_en)}</td>
        <td>${escapeHtml(i.worker_nombre || '—')}${i.worker_dni ? `<br><span class="card-sub" style="margin:0;">${escapeHtml(i.worker_dni)}</span>` : ''}</td>
        <td>${escapeHtml(i.sucursal_nombre || '—')}</td>
        <td>${escapeHtml(ACCIONES_INTENTO[i.accion] || i.accion || '—')}</td>
        <td>${escapeHtml(MOTIVOS_INTENTO[i.motivo] || i.motivo)}</td>
        <td>${metros(i.distancia_m)}</td>
        <td>${i.precision_m === null || i.precision_m === undefined ? '—' : `±${Math.round(Number(i.precision_m))} m`}</td>
        <td>${escapeHtml(DISPOSITIVOS[i.dispositivo] || '—')}</td>
      </tr>`
    )
    .join('');
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
        bloque.dispatchEvent(new CustomEvent('dana:ubicacion'));
        btn.disabled = false;
        btn.textContent = textoOriginal;
        const precision = Math.round(posicion.coords.accuracy);
        errorBox.innerHTML =
          precision > 100
            ? `<div class="error">Ubicación imprecisa (±${precision} m): las computadoras suelen ubicarse por internet y pueden errar por cientos de metros. ${GOOGLE_MAPS_KEY ? 'Ajusta el pin en el mapa hasta la puerta del local' : 'Hazlo desde un celular parado en el local'} antes de guardar.</div>`
            : `<p class="card-sub" style="margin:6px 0 0;">Ubicación obtenida con precisión de ±${precision} m.</p>`;
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
cargarIntentos();
