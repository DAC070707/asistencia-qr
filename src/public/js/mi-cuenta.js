// Tarjeta "Mi cuenta": cambiar la propia contraseña (admin o super-admin;
// el endpoint viene en data-endpoint del formulario).
(function () {
  const form = document.getElementById('mi-cuenta-form');
  if (!form) return;
  const errorBox = document.getElementById('mi-cuenta-error');
  const btn = document.getElementById('mi-cuenta-btn');

  function mensaje(html, tipo) {
    errorBox.innerHTML = `<div class="${tipo === 'ok' ? 'ciclo-legal-ok' : 'error'}">${html}</div>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    const actual = document.getElementById('clave-actual').value;
    const nueva = document.getElementById('clave-nueva').value;
    const confirmacion = document.getElementById('clave-confirmacion').value;
    if (nueva !== confirmacion) {
      mensaje('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    btn.disabled = true;
    try {
      const resp = await fetch(form.dataset.endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva, confirmacion })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const div = document.createElement('div');
        div.textContent = data.error || 'No se pudo cambiar la contraseña';
        mensaje(div.innerHTML);
        return;
      }
      form.reset();
      mensaje('Contraseña actualizada. Las sesiones abiertas en otros equipos se cerraron.', 'ok');
      document.querySelectorAll('.aviso-cuenta-clave').forEach((el) => el.remove());
    } catch (err) {
      mensaje('Error de conexión, intenta de nuevo.');
    } finally {
      btn.disabled = false;
    }
  });

  // Si llega con #mi-cuenta (menú de usuario o contraseña temporal), ir a la tarjeta.
  if (location.hash === '#mi-cuenta') {
    setTimeout(() => {
      document.getElementById('mi-cuenta').scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('clave-actual').focus({ preventScroll: true });
    }, 300);
  }
})();
