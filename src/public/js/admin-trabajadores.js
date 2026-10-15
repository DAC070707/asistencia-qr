function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const tbody = document.getElementById('tabla-trabajadores');
const buscarInput = document.getElementById('buscar-input');
let workersCache = [];
let sucursalesCache = [];
let config = null; // configuracion de la empresa (obreros)
const CATEGORIAS = { operario: 'Operario', oficial: 'Oficial', peon: 'Peón' };

function conObreros() {
  return Boolean(config && config.gestionaObreros);
}
function conCategoria() {
  return conObreros() && config.regimenObreros === 'construccion_civil';
}
function totalColumnas() {
  return 9 + (conObreros() ? 1 : 0) + (conCategoria() ? 1 : 0);
}

function renderEncabezado() {
  const columnas = ['Nombre', 'DNI'];
  if (conObreros()) columnas.push('Tipo');
  if (conCategoria()) columnas.push('Categoría');
  columnas.push('Horario', 'Sucursal', 'Fecha de ingreso', 'Activo', 'Horas extra', 'Dispositivo', '');
  document.getElementById('encabezado-trabajadores').innerHTML = columnas.map((c) => `<th>${c}</th>`).join('');
}

function selectTipoHtml(w) {
  const tipo = w.tipo_trabajador || 'empleado';
  return `<select class="input-tipo" style="margin:0;">
    <option value="empleado" ${tipo === 'empleado' ? 'selected' : ''}>Empleado</option>
    <option value="obrero" ${tipo === 'obrero' ? 'selected' : ''}>Obrero</option>
  </select>`;
}

function selectCategoriaHtml(w) {
  const opciones = ['<option value="">—</option>']
    .concat(
      Object.entries(CATEGORIAS).map(
        ([valor, texto]) => `<option value="${valor}" ${w.categoria === valor ? 'selected' : ''}>${texto}</option>`
      )
    )
    .join('');
  return `<select class="input-categoria" style="margin:0;" ${w.tipo_trabajador === 'obrero' ? '' : 'disabled'}>${opciones}</select>`;
}

function selectSucursalHtml(w) {
  const opciones = ['<option value="">Sin asignar</option>']
    .concat(
      sucursalesCache.map(
        (s) => `<option value="${s.id}" ${s.id === w.sucursal_id ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`
      )
    )
    .join('');
  return `<select class="input-sucursal" style="margin:0;">${opciones}</select>`;
}

function etiquetaHorario(tipoHorario) {
  if (tipoHorario === 'semanal') return 'Semanal';
  if (tipoHorario === 'rotativo') return 'Rotativo';
  if (tipoHorario === 'ciclo') return 'Jornada atípica';
  return 'Sin asignar';
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

function renderWorkers(workers) {
  if (workers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalColumnas()}">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = workers
    .map(
      (w) => `
        <tr data-id="${w.id}">
          <td class="c-nombre"><div class="name-cell"><div class="name-avatar">${iniciales(w.nombre)}</div><div><span class="nombre-fila">${escapeHtml(w.nombre)}</span><span class="sub-fila solo-movil">DNI: ${escapeHtml(w.dni)}</span></div></div></td>
          <td class="c-dni">${escapeHtml(w.dni)}</td>
          ${conObreros() ? `<td class="c-tipo sep-movil" data-label="Tipo">${selectTipoHtml(w)}</td>` : ''}
          ${conCategoria() ? `<td class="c-categoria sep-movil" data-label="Categoría">${selectCategoriaHtml(w)}</td>` : ''}
          <td class="c-horario sep-movil" data-label="Horario">${etiquetaHorario(w.tipo_horario)} — <a href="/admin/trabajadores/${w.id}/horario">Configurar</a></td>
          <td class="c-sucursal sep-movil" data-label="Sucursal">${selectSucursalHtml(w)}</td>
          <td class="c-fecha sep-movil" data-label="Fecha de ingreso"><input type="date" class="input-fecha-ingreso" value="${w.fecha_ingreso ? String(w.fecha_ingreso).slice(0, 10) : ''}" style="margin:0;" /></td>
          <td class="c-activo sep-movil" data-label="Activo"><input type="checkbox" class="input-activo" ${w.activo ? 'checked' : ''} /></td>
          <td class="c-extra sep-movil" data-label="Horas extra"><input type="checkbox" class="input-horas-extra" ${w.horas_extra_activas ? 'checked' : ''} /></td>
          <td class="c-dispositivo">
            ${
              w.dispositivo_vinculado
                ? '<span class="badge badge-tarde">Vinculado</span> <button type="button" class="boton-mini secundario desvincular-btn solo-escritorio">Desvincular</button>'
                : '<span class="badge badge-a_tiempo">Sin vincular</span>'
            }
            <span class="menu-fila solo-movil">
              <button type="button" class="menu-fila-btn" aria-label="Más opciones">⋮</button>
              <span class="menu-fila-lista" hidden>
                <a href="/admin/trabajadores/${w.id}/horario">Configurar horario</a>
                ${w.dispositivo_vinculado ? '<button type="button" class="desvincular-btn">Desvincular dispositivo</button>' : ''}
              </span>
            </span>
          </td>
          <td class="c-acciones"><button type="button" class="boton-mini guardar-btn">Guardar</button></td>
        </tr>`
    )
    .join('');
}

async function cargarWorkers() {
  if (!config) {
    const respConfig = await fetch('/api/admin/empresa/configuracion');
    if (respConfig.ok) config = await respConfig.json();
    renderEncabezado();
  }
  if (sucursalesCache.length === 0) {
    const respSuc = await fetch('/api/admin/sucursales');
    if (respSuc.ok) sucursalesCache = await respSuc.json();
  }
  const resp = await fetch('/api/admin/workers');
  if (!resp.ok) {
    tbody.innerHTML = `<tr><td colspan="${totalColumnas()}">Error al cargar</td></tr>`;
    return;
  }
  workersCache = await resp.json();

  if (workersCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalColumnas()}">Aún no hay trabajadores registrados</td></tr>`;
    return;
  }

  renderWorkers(workersCache);
}

buscarInput.addEventListener('input', () => {
  const q = buscarInput.value.trim().toLowerCase();
  if (!q) return renderWorkers(workersCache);
  renderWorkers(workersCache.filter((w) => w.nombre.toLowerCase().includes(q) || w.dni.includes(q)));
});

// La categoria solo aplica a obreros.
tbody.addEventListener('change', (e) => {
  if (!e.target.classList.contains('input-tipo')) return;
  const categoria = e.target.closest('tr').querySelector('.input-categoria');
  if (categoria) {
    categoria.disabled = e.target.value !== 'obrero';
    if (categoria.disabled) categoria.value = '';
  }
});

// Menu ⋮ de cada tarjeta (celular).
function cerrarMenusFila(excepto) {
  document.querySelectorAll('.menu-fila-lista').forEach((m) => {
    if (m !== excepto) m.hidden = true;
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-fila')) cerrarMenusFila(null);
});

tbody.addEventListener('click', async (e) => {
  if (e.target.classList.contains('menu-fila-btn')) {
    const lista = e.target.parentElement.querySelector('.menu-fila-lista');
    cerrarMenusFila(lista);
    lista.hidden = !lista.hidden;
    return;
  }
  if (e.target.classList.contains('desvincular-btn')) {
    if (!confirm('¿Desvincular el dispositivo de este trabajador? Podrá identificarse de nuevo desde cualquier celular.')) return;
    const id = e.target.closest('tr').dataset.id;
    e.target.disabled = true;
    await fetch(`/api/admin/workers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispositivo_vinculado: false })
    });
    return cargarWorkers();
  }

  if (!e.target.classList.contains('guardar-btn')) return;

  const fila = e.target.closest('tr');
  const id = fila.dataset.id;
  const activo = fila.querySelector('.input-activo').checked;
  const horasExtraActivas = fila.querySelector('.input-horas-extra').checked;
  const fechaIngreso = fila.querySelector('.input-fecha-ingreso').value || null;
  const sucursalId = fila.querySelector('.input-sucursal').value || null;
  const cambios = { activo, horas_extra_activas: horasExtraActivas, fecha_ingreso: fechaIngreso, sucursal_id: sucursalId };
  if (conObreros()) cambios.tipo_trabajador = fila.querySelector('.input-tipo').value;
  if (conCategoria()) cambios.categoria = fila.querySelector('.input-categoria').value || null;

  e.target.disabled = true;
  e.target.textContent = 'Guardando...';

  try {
    const resp = await fetch(`/api/admin/workers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios)
    });
    e.target.textContent = resp.ok ? 'Guardado ✓' : 'Error';
  } catch (err) {
    e.target.textContent = 'Error';
  } finally {
    setTimeout(() => {
      e.target.disabled = false;
      e.target.textContent = 'Guardar';
    }, 1500);
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarWorkers();
