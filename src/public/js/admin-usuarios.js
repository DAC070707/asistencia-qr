function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const PERFILES = {
  visualizacion: [],
  corrector: ['corregir_marcaciones', 'aprobar_horas_extra'],
  editor: ['gestionar_horarios'],
  supervisor: ['corregir_marcaciones', 'aprobar_horas_extra', 'gestionar_horarios', 'gestionar_trabajadores']
};
const NOMBRES_PERMISOS = {
  corregir_marcaciones: 'Corregir marcaciones',
  aprobar_horas_extra: 'Aprobar horas extra',
  gestionar_horarios: 'Gestionar horarios',
  gestionar_trabajadores: 'Gestionar trabajadores',
  administrar_qr: 'Administrar el QR',
  configuracion: 'Configuración'
};

const form = document.getElementById('usuario-form');
const formError = document.getElementById('form-error');
const aviso = document.getElementById('usuarios-aviso');
const tbody = document.getElementById('tabla-usuarios');
const selectSucursal = document.getElementById('u-sucursal');
const checks = () => [...document.querySelectorAll('#permisos-lista input[value]')];
let usuarios = [];
let cupo = { limite: 0, usados: 0 };
let editandoId = null;

function perfilDe(permisos) {
  const ordenados = [...permisos].sort().join(',');
  const encontrado = Object.entries(PERFILES).find(([, p]) => [...p].sort().join(',') === ordenados);
  return encontrado ? encontrado[0] : 'personalizado';
}
const ETIQUETA_PERFIL = { visualizacion: 'Visualización', corrector: 'Corrector', editor: 'Editor', supervisor: 'Supervisor', personalizado: 'Personalizado' };

function marcarPerfil(perfil) {
  document.querySelectorAll('#perfiles [data-perfil]').forEach((b) => {
    b.classList.toggle('activo', b.dataset.perfil === perfil);
  });
}

function aplicarPermisos(permisos) {
  checks().forEach((c) => {
    c.checked = permisos.includes(c.value);
  });
  restriccionSucursal();
  marcarPerfil(perfilDe(permisosMarcados()));
}

function permisosMarcados() {
  return checks().filter((c) => c.checked && !c.disabled).map((c) => c.value);
}

// Un usuario limitado a una sucursal no puede tener Configuración.
function restriccionSucursal() {
  const conSucursal = Boolean(selectSucursal.value);
  const config = document.querySelector('#permisos-lista input[value="configuracion"]');
  config.disabled = conSucursal;
  if (conSucursal) config.checked = false;
  document.getElementById('u-sucursal-ayuda').hidden = !conSucursal;
}

document.getElementById('perfiles').addEventListener('click', (e) => {
  const perfil = e.target.dataset?.perfil;
  if (!perfil) return;
  if (perfil !== 'personalizado') aplicarPermisos(PERFILES[perfil]);
  marcarPerfil(perfil);
});
document.getElementById('permisos-lista').addEventListener('change', () => marcarPerfil(perfilDe(permisosMarcados())));
selectSucursal.addEventListener('change', () => {
  restriccionSucursal();
  marcarPerfil(perfilDe(permisosMarcados()));
});

function textoPermisos(u) {
  if (u.rol === 'principal') return 'Todo';
  const lista = (u.permisos || []).map((p) => NOMBRES_PERMISOS[p]).filter(Boolean);
  return `${ETIQUETA_PERFIL[perfilDe(u.permisos || [])]}: ver${lista.length ? ', ' + lista.join(', ').toLowerCase() : ''}`;
}

function render() {
  const disponibles = cupo.limite - cupo.usados;
  document.getElementById('cupo-badge').textContent = `${cupo.usados} de ${cupo.limite} usuario(s) adicional(es)`;
  const lleno = !editandoId && disponibles <= 0;
  document.getElementById('cupo-lleno').hidden = !lleno;
  form.hidden = lleno;

  tbody.innerHTML = usuarios
    .map((u) => {
      const acciones =
        u.rol === 'principal'
          ? '<span class="card-sub" style="margin:0;">Tú</span>'
          : `<button type="button" class="boton-mini secundario editar-btn">Editar</button>
             <button type="button" class="boton-mini secundario activar-btn">${u.activo ? 'Desactivar' : 'Activar'}</button>
             <button type="button" class="boton-mini secundario restablecer-btn">Restablecer contraseña</button>
             <button type="button" class="boton-mini secundario eliminar-btn" style="color:var(--red);">Eliminar</button>`;
      return `
        <tr data-id="${u.id}">
          <td><strong>${escapeHtml(u.nombre || u.email)}</strong><br><span class="card-sub" style="margin:0;">${escapeHtml(u.email)}</span>${u.debeCambiarPassword ? ' <span class="badge badge-pendiente">Contraseña temporal</span>' : ''}</td>
          <td data-label="Rol">${u.rol === 'principal' ? 'Principal' : 'Adicional'}</td>
          <td data-label="Puede">${escapeHtml(textoPermisos(u))}</td>
          <td data-label="Sucursal">${u.rol === 'principal' || !u.sucursalId ? 'Todas' : escapeHtml(u.sucursalNombre || '')}</td>
          <td data-label="Estado">${u.activo ? '<span class="badge badge-aprobado">Activo</span>' : '<span class="badge badge-rechazado">Desactivado</span>'}</td>
          <td class="td-botones">${acciones}</td>
        </tr>`;
    })
    .join('');
}

async function cargar() {
  const [respU, respS] = await Promise.all([fetch('/api/admin/usuarios'), fetch('/api/admin/sucursales')]);
  if (respS.ok) {
    const sucursales = await respS.json();
    selectSucursal.innerHTML =
      '<option value="">Todas las sucursales</option>' +
      sucursales.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
  }
  if (!respU.ok) {
    tbody.innerHTML = '<tr><td colspan="6">No se pudo cargar</td></tr>';
    return;
  }
  const data = await respU.json();
  usuarios = data.usuarios;
  cupo = data.cupo;
  render();
}

function modoNuevo() {
  editandoId = null;
  form.reset();
  document.getElementById('form-titulo').textContent = 'Nuevo usuario';
  document.getElementById('u-guardar').textContent = 'Crear usuario';
  document.getElementById('u-cancelar').hidden = true;
  ['u-email-label', 'u-password-label', 'u-password-ayuda'].forEach((id) => {
    document.getElementById(id).hidden = false;
  });
  formError.innerHTML = '';
  aplicarPermisos(PERFILES.visualizacion);
  render();
}

function modoEditar(u) {
  editandoId = u.id;
  document.getElementById('form-titulo').textContent = `Editar a ${u.nombre || u.email}`;
  document.getElementById('u-guardar').textContent = 'Guardar cambios';
  document.getElementById('u-cancelar').hidden = false;
  ['u-email-label', 'u-password-label', 'u-password-ayuda'].forEach((id) => {
    document.getElementById(id).hidden = true;
  });
  document.getElementById('u-nombre').value = u.nombre || '';
  selectSucursal.value = u.sucursalId || '';
  aplicarPermisos(u.permisos || []);
  formError.innerHTML = '';
  render();
  document.getElementById('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('u-cancelar').addEventListener('click', modoNuevo);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.innerHTML = '';
  const body = {
    nombre: document.getElementById('u-nombre').value,
    permisos: permisosMarcados(),
    sucursalId: selectSucursal.value || null
  };
  if (!editandoId) {
    body.email = document.getElementById('u-email').value;
    body.password = document.getElementById('u-password').value;
  }
  const btn = document.getElementById('u-guardar');
  btn.disabled = true;
  try {
    const resp = await fetch(editandoId ? `/api/admin/usuarios/${editandoId}` : '/api/admin/usuarios', {
      method: editandoId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      formError.innerHTML = `<div class="error">${escapeHtml(data.error || 'No se pudo guardar')}</div>`;
      return;
    }
    aviso.innerHTML = `<div class="ciclo-legal-ok">${editandoId ? 'Cambios guardados.' : `Usuario creado. Pásale su correo y la contraseña inicial; al entrar se le pedirá crear la suya.`}</div>`;
    await cargar();
    modoNuevo();
  } finally {
    btn.disabled = false;
  }
});

tbody.addEventListener('click', async (e) => {
  const fila = e.target.closest('tr[data-id]');
  if (!fila) return;
  const u = usuarios.find((x) => String(x.id) === fila.dataset.id);
  aviso.innerHTML = '';

  if (e.target.classList.contains('editar-btn')) return modoEditar(u);

  if (e.target.classList.contains('activar-btn')) {
    if (u.activo && !confirm(`¿Desactivar a ${u.nombre || u.email}? No podrá entrar hasta que lo actives de nuevo.`)) return;
    await fetch(`/api/admin/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !u.activo })
    });
    return cargar();
  }

  if (e.target.classList.contains('restablecer-btn')) {
    if (!confirm(`¿Restablecer la contraseña de ${u.email}? Se generará una temporal y se cerrarán sus sesiones abiertas.`)) return;
    const resp = await fetch(`/api/admin/usuarios/${u.id}/restablecer-password`, { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      aviso.innerHTML = `<div class="error">${escapeHtml(data.error || 'No se pudo restablecer')}</div>`;
      return;
    }
    aviso.innerHTML = `
      <div class="ciclo-legal-ok">
        Contraseña temporal de <b>${escapeHtml(data.email)}</b>:
        <code class="clave-temporal">${escapeHtml(data.passwordTemporal)}</code>
        <button type="button" class="boton-mini secundario" id="copiar-temporal">Copiar</button>
        <br>Pásasela. Solo se muestra esta vez; al entrar se le pedirá crear una nueva.
      </div>`;
    document.getElementById('copiar-temporal').addEventListener('click', async (ev) => {
      try {
        await navigator.clipboard.writeText(data.passwordTemporal);
        ev.target.textContent = 'Copiada ✓';
      } catch (err) {
        window.prompt('Copia la contraseña temporal:', data.passwordTemporal);
      }
    });
    aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return cargar();
  }

  if (e.target.classList.contains('eliminar-btn')) {
    if (!confirm(`¿Eliminar a ${u.nombre || u.email}? Ya no podrá entrar y se liberará el cupo. Sus correcciones seguirán mostrando su nombre.`)) return;
    await fetch(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' });
    if (editandoId === u.id) modoNuevo();
    return cargar();
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

aplicarPermisos(PERFILES.visualizacion);
cargar();
