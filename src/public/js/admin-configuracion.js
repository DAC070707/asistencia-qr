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

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarConfiguracion();
