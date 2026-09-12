(function () {
  const contenedor = document.querySelector('[data-geo-activa]');
  if (!contenedor || contenedor.dataset.geoActiva !== '1') return;

  const errorBox = document.getElementById('geo-error');
  const forms = document.querySelectorAll('form.form-marcar');

  function mostrarError(mensaje) {
    errorBox.textContent = mensaje;
    errorBox.hidden = false;
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (form.dataset.geoLista === '1') return; // ya tiene lat/lng, dejar pasar

      e.preventDefault();
      errorBox.hidden = true;

      if (!navigator.geolocation) {
        mostrarError('Tu navegador no soporta geolocalización, necesaria para marcar asistencia aquí.');
        return;
      }

      const boton = form.querySelector('button[type="submit"]');
      const textoOriginal = boton.textContent;
      boton.disabled = true;
      boton.textContent = 'Obteniendo tu ubicación…';

      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          const lat = document.createElement('input');
          lat.type = 'hidden';
          lat.name = 'lat';
          lat.value = posicion.coords.latitude;
          const lng = document.createElement('input');
          lng.type = 'hidden';
          lng.name = 'lng';
          lng.value = posicion.coords.longitude;
          form.appendChild(lat);
          form.appendChild(lng);
          form.dataset.geoLista = '1';
          form.submit();
        },
        () => {
          boton.disabled = false;
          boton.textContent = textoOriginal;
          mostrarError(
            'No pudimos acceder a tu ubicación. Debes permitir el permiso de ubicación en tu navegador para marcar asistencia.'
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  });
})();
