function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function soloHora(valorTime) {
  return valorTime ? valorTime.slice(0, 5) : '';
}

const tbody = document.getElementById('tabla-turnos');
const crearForm = document.getElementById('crear-form');
const crearError = document.getElementById('crear-error');

async function cargarTurnos() {
  const resp = await fetch('/api/admin/turnos');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>';
    return;
  }
  const turnos = await resp.json();

  if (turnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aún no hay turnos creados</td></tr>';
    return;
  }

  tbody.innerHTML = turnos
    .map(
      (t) => `
        <tr data-id="${t.id}">
          <td><input type="text" class="input-nombre" value="${escapeHtml(t.nombre)}" style="width:100%;" /></td>
          <td><input type="time" class="input-entrada" value="${soloHora(t.hora_entrada)}" /></td>
          <td><input type="time" class="input-salida" value="${soloHora(t.hora_salida)}" /></td>
          <td><input type="checkbox" class="input-cruza" ${t.cruza_medianoche ? 'checked' : ''} /></td>
          <td><input type="checkbox" class="input-descanso" ${t.es_descanso ? 'checked' : ''} /></td>
          <td>
            <button type="button" class="boton-mini guardar-btn">Guardar</button>
            <button type="button" class="boton-mini secundario eliminar-btn">Eliminar</button>
          </td>
        </tr>`
    )
    .join('');
}

crearForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  crearError.innerHTML = '';

  const nombre = document.getElementById('nombre-input').value;
  const horaEntrada = document.getElementById('entrada-input').value;
  const horaSalida = document.getElementById('salida-input').value;
  const cruzaMedianoche = document.getElementById('cruza-input').checked;
  const esDescanso = document.getElementById('descanso-input').checked;

  const resp = await fetch('/api/admin/turnos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, horaEntrada, horaSalida, cruzaMedianoche, esDescanso })
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    crearError.innerHTML = `<div class="error">${data.error || 'No se pudo crear el turno'}</div>`;
    return;
  }

  crearForm.reset();
  await cargarTurnos();
});

tbody.addEventListener('click', async (e) => {
  const fila = e.target.closest('tr');
  if (!fila) return;
  const id = fila.dataset.id;

  if (e.target.classList.contains('guardar-btn')) {
    const nombre = fila.querySelector('.input-nombre').value;
    const esDescanso = fila.querySelector('.input-descanso').checked;
    const cambios = {
      nombre,
      esDescanso,
      cruzaMedianoche: fila.querySelector('.input-cruza').checked,
      horaEntrada: esDescanso ? null : fila.querySelector('.input-entrada').value || null,
      horaSalida: esDescanso ? null : fila.querySelector('.input-salida').value || null
    };
    e.target.disabled = true;
    e.target.textContent = 'Guardando...';
    const resp = await fetch(`/api/admin/turnos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios)
    });
    e.target.textContent = resp.ok ? 'Guardado ✓' : 'Error';
    setTimeout(() => {
      e.target.disabled = false;
      e.target.textContent = 'Guardar';
    }, 1500);
    return;
  }

  if (e.target.classList.contains('eliminar-btn')) {
    if (!confirm('¿Eliminar este turno?')) return;
    const resp = await fetch(`/api/admin/turnos/${id}`, { method: 'DELETE' });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      alert(data.error || 'No se pudo eliminar el turno');
      return;
    }
    await cargarTurnos();
  }
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

cargarTurnos();
