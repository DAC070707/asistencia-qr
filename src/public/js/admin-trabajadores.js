function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const tbody = document.getElementById('tabla-trabajadores');
const buscarInput = document.getElementById('buscar-input');
let workersCache = [];

function etiquetaHorario(tipoHorario) {
  if (tipoHorario === 'semanal') return 'Semanal';
  if (tipoHorario === 'rotativo') return 'Rotativo';
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
    tbody.innerHTML = '<tr><td colspan="6">Sin resultados</td></tr>';
    return;
  }

  tbody.innerHTML = workers
    .map(
      (w) => `
        <tr data-id="${w.id}">
          <td><div class="name-cell"><div class="name-avatar">${iniciales(w.nombre)}</div>${escapeHtml(w.nombre)}</div></td>
          <td>${escapeHtml(w.dni)}</td>
          <td>${etiquetaHorario(w.tipo_horario)} — <a href="/admin/trabajadores/${w.id}/horario">Configurar</a></td>
          <td><input type="checkbox" class="input-activo" ${w.activo ? 'checked' : ''} /></td>
          <td><input type="checkbox" class="input-horas-extra" ${w.horas_extra_activas ? 'checked' : ''} /></td>
          <td><button type="button" class="boton-mini guardar-btn">Guardar</button></td>
        </tr>`
    )
    .join('');
}

async function cargarWorkers() {
  const resp = await fetch('/api/admin/workers');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>';
    return;
  }
  workersCache = await resp.json();

  if (workersCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aún no hay trabajadores registrados</td></tr>';
    return;
  }

  renderWorkers(workersCache);
}

buscarInput.addEventListener('input', () => {
  const q = buscarInput.value.trim().toLowerCase();
  if (!q) return renderWorkers(workersCache);
  renderWorkers(workersCache.filter((w) => w.nombre.toLowerCase().includes(q) || w.dni.includes(q)));
});

tbody.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('guardar-btn')) return;

  const fila = e.target.closest('tr');
  const id = fila.dataset.id;
  const activo = fila.querySelector('.input-activo').checked;
  const horasExtraActivas = fila.querySelector('.input-horas-extra').checked;

  e.target.disabled = true;
  e.target.textContent = 'Guardando...';

  try {
    const resp = await fetch(`/api/admin/workers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo, horas_extra_activas: horasExtraActivas })
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
