function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function soloHora(valorTime) {
  // Postgres devuelve "HH:MM:SS" para columnas TIME; el input type=time quiere "HH:MM"
  return valorTime ? valorTime.slice(0, 5) : '';
}

const tbody = document.getElementById('tabla-trabajadores');

async function cargarWorkers() {
  const resp = await fetch('/api/admin/workers');
  if (!resp.ok) {
    tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>';
    return;
  }
  const workers = await resp.json();

  if (workers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aún no hay trabajadores registrados</td></tr>';
    return;
  }

  tbody.innerHTML = workers
    .map(
      (w) => `
        <tr data-id="${w.id}">
          <td>${escapeHtml(w.nombre)}</td>
          <td>${escapeHtml(w.dni)}</td>
          <td><input type="time" class="input-entrada" value="${soloHora(w.hora_entrada_programada)}" /></td>
          <td><input type="time" class="input-salida" value="${soloHora(w.hora_salida_programada)}" /></td>
          <td><input type="checkbox" class="input-activo" ${w.activo ? 'checked' : ''} /></td>
          <td><button type="button" class="boton-mini guardar-btn">Guardar</button></td>
        </tr>`
    )
    .join('');
}

tbody.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('guardar-btn')) return;

  const fila = e.target.closest('tr');
  const id = fila.dataset.id;
  const horaEntrada = fila.querySelector('.input-entrada').value;
  const horaSalida = fila.querySelector('.input-salida').value;
  const activo = fila.querySelector('.input-activo').checked;

  e.target.disabled = true;
  e.target.textContent = 'Guardando...';

  try {
    const resp = await fetch(`/api/admin/workers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hora_entrada_programada: horaEntrada || null,
        hora_salida_programada: horaSalida || null,
        activo
      })
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
