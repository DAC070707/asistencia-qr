// Si el navegador restaura la pagina de marcar desde su cache al ir "atras"
// (comun en iPhone), recargarla: el servidor muestra "Escanea el QR
// nuevamente" si ese escaneo ya se uso.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

(function () {
  const contenedor = document.querySelector('[data-geo-activa]');
  if (!contenedor || contenedor.dataset.geoActiva !== '1') return;

  const token = contenedor.dataset.token;
  const radio = Number(contenedor.dataset.radio) || 50;
  const errorBox = document.getElementById('geo-error');
  const avisoNavegador = document.getElementById('aviso-navegador');
  const forms = document.querySelectorAll('form.form-marcar');

  const ua = navigator.userAgent || '';
  const esIphone = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/i.test(ua);
  // Navegadores dentro de otras apps: suelen bloquear o no pedir la ubicacion.
  const esNavegadorInterno = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(ua);

  // Lectura "suficientemente buena" para enviar de inmediato.
  const PRECISION_OBJETIVO_M = 25;
  // A los 8 s se envia la mejor lectura si su margen es razonable.
  const PRECISION_ACEPTABLE_M = Math.max(100, radio + 50);
  const ESPERA_INTERMEDIA_MS = 8000;
  const ESPERA_MAXIMA_MS = 20000;

  const enlaceCheckin = `${location.origin}/checkin/${token}`;

  // ---------- Mensajes ----------

  function pasosPermiso() {
    if (esIphone) {
      return `
        <strong>Tu iPhone no está dando permiso de ubicación.</strong>
        <ol>
          <li>Abre <b>Ajustes › Privacidad y seguridad › Localización</b> y verifica que esté <b>activada</b>.</li>
          <li>En esa misma lista entra a <b>Safari</b> (o <b>Chrome</b> si usas Chrome) y elige <b>"Al usar la app"</b>.</li>
          <li>Activa <b>"Ubicación exacta"</b>.</li>
          <li>Vuelve aquí, recarga la página y toca el botón otra vez. Si aparece un aviso, elige <b>"Permitir"</b>.</li>
        </ol>`;
    }
    if (esAndroid) {
      return `
        <strong>Tu teléfono no está dando permiso de ubicación.</strong>
        <ol>
          <li>Baja la barra de notificaciones y verifica que <b>Ubicación</b> esté <b>encendida</b>.</li>
          <li>Toca el <b>candado</b> (o el ícono ⓘ) junto a la dirección de esta página › <b>Permisos</b> › <b>Ubicación</b> › <b>Permitir</b>.</li>
          <li>Si no aparece, en Chrome ve a <b>⋮ › Configuración › Configuración de sitios › Ubicación</b> y quita este sitio de "Bloqueados".</li>
          <li>Recarga la página y toca el botón otra vez.</li>
        </ol>`;
    }
    return `
      <strong>El navegador no está dando permiso de ubicación.</strong>
      Permite el acceso a la ubicación para este sitio (ícono junto a la dirección), recarga la página y vuelve a intentar.`;
  }

  function pasosSinSenal() {
    return `
      <strong>No pudimos obtener tu ubicación.</strong>
      <ol>
        <li>Verifica que la <b>ubicación del teléfono</b> esté encendida${esAndroid ? ' (y en modo de <b>alta precisión</b> si te lo pregunta)' : ''}.</li>
        <li>Activa el <b>Wi-Fi</b> aunque no te conectes: ayuda mucho a ubicarte dentro de edificios.</li>
        <li>Acércate a una <b>ventana o a la puerta</b> del local y toca el botón otra vez.</li>
      </ol>`;
  }

  function mostrarError(html) {
    errorBox.innerHTML = html;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function reportarFalla(motivo, accion, precision) {
    try {
      fetch(`/checkin/${token}/intento-fallido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo, accion, precision }),
        keepalive: true,
        credentials: 'same-origin'
      }).catch(() => {});
    } catch (e) {
      /* solo diagnostico */
    }
  }

  // ---------- Aviso de navegador dentro de otra app ----------

  if (esNavegadorInterno) {
    const botones = [];
    if (esAndroid) {
      const sinEsquema = enlaceCheckin.replace(/^https?:\/\//, '');
      botones.push(
        `<a class="boton boton-mini" href="intent://${sinEsquema}#Intent;scheme=https;package=com.android.chrome;end">Abrir en Chrome</a>`
      );
    }
    botones.push('<button type="button" class="boton-mini" id="copiar-enlace">Copiar enlace</button>');
    avisoNavegador.innerHTML = `
      <strong>Estás dentro de otra app (WhatsApp, Instagram, Facebook…).</strong>
      Estas apps suelen bloquear la ubicación. Abre este enlace en <b>${esIphone ? 'Safari' : 'Chrome'}</b>
      ${esIphone ? '(toca <b>···</b> o el ícono de compartir › <b>Abrir en Safari</b>)' : ''} para marcar sin problemas.
      <div>${botones.join('')}</div>`;
    avisoNavegador.hidden = false;
    const copiar = document.getElementById('copiar-enlace');
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(enlaceCheckin);
        copiar.textContent = 'Enlace copiado ✓';
      } catch (e) {
        window.prompt('Copia este enlace y ábrelo en tu navegador:', enlaceCheckin);
      }
    });
  }

  // Si ya sabemos que el permiso esta bloqueado, avisar antes de que toque.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((estado) => {
        if (estado.state === 'denied') mostrarError(pasosPermiso());
      })
      .catch(() => {});
  }

  // ---------- Obtener la ubicacion ----------

  // Escucha el GPS y se queda con la lectura mas precisa. Resuelve con
  // { lat, lng, precision } o rechaza con { motivo }.
  function obtenerUbicacion(alActualizar) {
    return new Promise((resolve, reject) => {
      let mejor = null;
      let terminado = false;
      let watchId = null;
      const timers = [];

      function terminar(fn, valor) {
        if (terminado) return;
        terminado = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        timers.forEach(clearTimeout);
        fn(valor);
      }

      function registrarLectura(pos) {
        const lectura = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy
        };
        if (!mejor || lectura.precision < mejor.precision) mejor = lectura;
        alActualizar(mejor.precision);
        if (mejor.precision <= PRECISION_OBJETIVO_M) terminar(resolve, mejor);
      }

      // Ultimo recurso: modo normal (Wi-Fi/antenas), acepta una lectura de hasta 1 min.
      function intentarModoNormal() {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            terminar(resolve, { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
          (err) => terminar(reject, { motivo: err.code === 1 ? 'sin_permiso' : err.code === 3 ? 'tiempo_agotado' : 'sin_senal' }),
          { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
        );
      }

      watchId = navigator.geolocation.watchPosition(
        registrarLectura,
        (err) => {
          // Permiso denegado no se arregla esperando.
          if (err.code === 1) terminar(reject, { motivo: 'sin_permiso' });
          // Sin senal / timeout: se sigue esperando hasta el limite.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: ESPERA_MAXIMA_MS }
      );

      timers.push(
        setTimeout(() => {
          if (mejor && mejor.precision <= PRECISION_ACEPTABLE_M) terminar(resolve, mejor);
        }, ESPERA_INTERMEDIA_MS)
      );
      timers.push(
        setTimeout(() => {
          if (terminado) return;
          if (mejor) return terminar(resolve, mejor);
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          watchId = null;
          intentarModoNormal();
        }, ESPERA_MAXIMA_MS)
      );
    });
  }

  function agregarCampo(form, nombre, valor) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = nombre;
    input.value = valor;
    form.appendChild(input);
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (form.dataset.geoLista === '1') return; // ya tiene lat/lng, dejar pasar

      e.preventDefault();
      errorBox.hidden = true;
      const accion = form.querySelector('input[name="accion"]')?.value;

      if (!navigator.geolocation) {
        reportarFalla('navegador_sin_soporte', accion);
        mostrarError(
          '<strong>Este navegador no permite usar la ubicación.</strong>Abre el enlace en Chrome (Android) o Safari (iPhone).'
        );
        return;
      }

      const boton = form.querySelector('button[type="submit"]');
      const textoOriginal = boton.textContent;
      boton.disabled = true;
      boton.textContent = 'Buscando tu ubicación…';

      obtenerUbicacion((precision) => {
        boton.textContent = `Buscando tu ubicación… (precisión ${Math.round(precision)} m)`;
      })
        .then((ubicacion) => {
          boton.textContent = 'Registrando…';
          agregarCampo(form, 'lat', ubicacion.lat);
          agregarCampo(form, 'lng', ubicacion.lng);
          agregarCampo(form, 'precision', Math.round(ubicacion.precision * 100) / 100);
          form.dataset.geoLista = '1';
          form.submit();
        })
        .catch(({ motivo }) => {
          boton.disabled = false;
          boton.textContent = textoOriginal;
          reportarFalla(motivo, accion);
          if (motivo === 'sin_permiso') {
            mostrarError(pasosPermiso());
          } else if (motivo === 'tiempo_agotado') {
            mostrarError(`${pasosSinSenal()}<div style="margin-top:6px;">Luego toca <b>${textoOriginal}</b> para reintentar.</div>`);
          } else {
            mostrarError(pasosSinSenal());
          }
        });
    });
  });
})();
