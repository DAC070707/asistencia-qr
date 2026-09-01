function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function cargarEmpresas() {
  const tbody = document.getElementById('tabla-empresas');
  const resp = await fetch('/api/superadmin/empresas');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>';
    return;
  }
  const empresas = await resp.json();

  if (empresas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Aún no hay empresas</td></tr>';
    return;
  }

  tbody.innerHTML = empresas
    .map(
      (e) => `
        <tr>
          <td>${escapeHtml(e.nombre)}</td>
          <td>${e.activo ? '✅' : '❌'}</td>
          <td>${e.trabajadores}</td>
          <td>${e.marcaciones}</td>
          <td>${new Date(e.creado_en).toLocaleDateString('es-PE')}</td>
        </tr>`
    )
    .join('');
}

document.getElementById('crear-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('crear-error');
  const btn = document.getElementById('crear-btn');
  errorBox.innerHTML = '';
  btn.disabled = true;

  const nombreEmpresa = document.getElementById('nombreEmpresa').value;
  const adminEmail = document.getElementById('adminEmail').value;
  const adminPassword = document.getElementById('adminPassword').value;

  try {
    const resp = await fetch('/api/superadmin/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombreEmpresa, adminEmail, adminPassword })
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorBox.innerHTML = `<div class="error">${data.error || 'No se pudo crear la empresa'}</div>`;
      return;
    }

    document.getElementById('crear-form').reset();
    await cargarEmpresas();
  } catch (err) {
    errorBox.innerHTML = '<div class="error">Error de conexion, intenta de nuevo.</div>';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/superadmin/logout', { method: 'POST' });
  window.location.href = '/superadmin/login';
});

cargarEmpresas();
