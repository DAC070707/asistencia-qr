function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const ESTADOS_CUENTA = {
  activa: 'Activa',
  pago_pendiente: 'Pago pendiente',
  suspendida: 'Suspendida'
};

function selectorEstadoHtml(e) {
  const estado = e.estado_cuenta || 'activa';
  return `
    <span class="estado-cuenta">
      <span class="badge badge-cuenta-${estado}">${ESTADOS_CUENTA[estado]}</span>
      <select class="input-estado-cuenta" data-empresa="${e.id}" data-actual="${estado}" style="margin:6px 0 0; max-width:170px;">
        ${Object.entries(ESTADOS_CUENTA)
          .map(([valor, texto]) => `<option value="${valor}" ${valor === estado ? 'selected' : ''}>${texto}</option>`)
          .join('')}
      </select>
    </span>`;
}

function adminsHtml(e) {
  if (!e.admins || e.admins.length === 0) return '—';
  return e.admins
    .map(
      (a) => `
      <div class="admin-fila">
        <span>${escapeHtml(a.email)}${a.debeCambiarPassword ? ' <span class="badge badge-pendiente" title="Debe cambiar su contraseña temporal">Temporal</span>' : ''}</span>
        <button type="button" class="boton-mini secundario restablecer-btn" data-admin="${a.id}" data-email="${escapeHtml(a.email)}">Restablecer contraseña</button>
      </div>`
    )
    .join('');
}

async function cargarEmpresas() {
  const tbody = document.getElementById('tabla-empresas');
  const resp = await fetch('/api/superadmin/empresas');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>';
    return;
  }
  const empresas = await resp.json();

  if (empresas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aún no hay empresas</td></tr>';
    return;
  }

  tbody.innerHTML = empresas
    .map(
      (e) => `
        <tr>
          <td><strong>${escapeHtml(e.nombre)}</strong></td>
          <td data-label="Estado">${selectorEstadoHtml(e)}</td>
          <td data-label="Trabajadores">${e.trabajadores}</td>
          <td data-label="Marcaciones">${e.marcaciones}</td>
          <td data-label="Creada">${new Date(e.creado_en).toLocaleDateString('es-PE')}</td>
          <td data-label="Admin">${adminsHtml(e)}</td>
        </tr>`
    )
    .join('');
}

const tablaEmpresas = document.getElementById('tabla-empresas');
const empresasError = document.getElementById('empresas-error');

tablaEmpresas.addEventListener('change', async (e) => {
  if (!e.target.classList.contains('input-estado-cuenta')) return;
  const select = e.target;
  const nuevo = select.value;
  const nombre = select.closest('tr').querySelector('strong').textContent;
  empresasError.innerHTML = '';

  if (
    nuevo === 'suspendida' &&
    !confirm(`¿Suspender a ${nombre}? Su admin no podrá entrar al panel y sus trabajadores no podrán marcar hasta que la reactives. No se borra ningún dato.`)
  ) {
    select.value = select.dataset.actual;
    return;
  }

  select.disabled = true;
  try {
    const resp = await fetch(`/api/superadmin/empresas/${select.dataset.empresa}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estadoCuenta: nuevo })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      empresasError.innerHTML = `<div class="error">${escapeHtml(data.error || 'No se pudo cambiar el estado')}</div>`;
      select.value = select.dataset.actual;
      return;
    }
    await cargarEmpresas();
  } finally {
    select.disabled = false;
  }
});

tablaEmpresas.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('restablecer-btn')) return;
  const btn = e.target;
  const email = btn.dataset.email;
  if (!confirm(`¿Restablecer la contraseña de ${email}? Se generará una contraseña temporal y se cerrarán sus sesiones abiertas.`)) return;
  empresasError.innerHTML = '';
  btn.disabled = true;
  try {
    const resp = await fetch(`/api/superadmin/admins/${btn.dataset.admin}/restablecer-password`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      empresasError.innerHTML = `<div class="error">${escapeHtml(data.error || 'No se pudo restablecer')}</div>`;
      return;
    }
    empresasError.innerHTML = `
      <div class="ciclo-legal-ok">
        Contraseña temporal de <b>${escapeHtml(data.email)}</b>:
        <code class="clave-temporal">${escapeHtml(data.passwordTemporal)}</code>
        <button type="button" class="boton-mini secundario" id="copiar-temporal">Copiar</button>
        <br>Pásasela al cliente. Solo se muestra esta vez; al entrar se le pedirá crear una nueva.
      </div>`;
    document.getElementById('copiar-temporal').addEventListener('click', async (ev) => {
      try {
        await navigator.clipboard.writeText(data.passwordTemporal);
        ev.target.textContent = 'Copiada ✓';
      } catch (err) {
        window.prompt('Copia la contraseña temporal:', data.passwordTemporal);
      }
    });
    empresasError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await cargarEmpresas();
  } finally {
    btn.disabled = false;
  }
});

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
