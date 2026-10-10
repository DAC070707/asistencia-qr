// Detecta si la pagina del QR se abrio dentro del navegador interno de otra
// app (Google / Lens, lectores de QR, WhatsApp, Instagram, Facebook...). Cada
// app guarda sus propias llaves, asi que ahi el trabajador no es reconocido
// y queda trabado. En ese caso se ocultan el formulario y los botones de
// marcar, y se ofrece abrir la MISMA pagina (mismo escaneo) en su navegador
// normal, donde si tiene su llave.
(function () {
  const ua = navigator.userAgent || '';
  const esIphone = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const esAndroid = /Android/i.test(ua);
  const DE_APPS = /GSA\/|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|TikTok|musical_ly|Snapchat/i;

  let interno = false;
  if (esAndroid) {
    // "; wv)" = WebView: lo usan los lectores de QR y la app de Google.
    interno = DE_APPS.test(ua) || /; wv\)/i.test(ua);
  } else if (esIphone) {
    // Safari y Chrome de iPhone incluyen "Safari/"; los navegadores internos no.
    interno = DE_APPS.test(ua) || !/Safari\//.test(ua);
  }

  window.DANA_NAVEGADOR = { esIphone, esAndroid, interno };

  const caja = document.getElementById('abrir-navegador');
  if (!interno || !caja) return;

  const url = new URL(caja.dataset.destino, location.origin);
  const sinEsquema = url.href.replace(/^https?:\/\//, '');
  const esquema = url.protocol.replace(':', '');
  const ocultables = document.querySelectorAll('[data-ocultar-en-interno]');
  ocultables.forEach((el) => {
    el.hidden = true;
  });

  let botones;
  if (esAndroid) {
    const fallback = encodeURIComponent(url.href);
    botones = `
      <a class="boton" href="intent://${sinEsquema}#Intent;scheme=${esquema};S.browser_fallback_url=${fallback};end">Abrir en mi navegador</a>
      <a class="boton secundario" href="intent://${sinEsquema}#Intent;scheme=${esquema};package=com.android.chrome;S.browser_fallback_url=${fallback};end">Abrir en Chrome</a>`;
  } else {
    botones = `
      <a class="boton" href="x-safari-https://${sinEsquema}">Abrir en Safari</a>
      <a class="boton secundario" href="googlechromes://${sinEsquema}">Abrir en Chrome</a>
      <button type="button" class="secundario" id="copiar-enlace-navegador">Copiar enlace</button>
      <p class="abrir-navegador-ayuda">Si no se abre, toca <b>···</b> o el ícono de compartir y elige <b>"Abrir en Safari"</b>.</p>`;
  }

  caja.innerHTML = `
    <strong>Abre esta página en tu navegador para marcar</strong>
    <p>La abriste desde otra app (un lector de QR, Google o una red social), donde tu celular no te reconoce. Ábrela en tu navegador con un toque:</p>
    <div class="abrir-navegador-botones">${botones}</div>
    <p class="abrir-navegador-ayuda">Para no ver este aviso, escanea siempre el QR con la <b>cámara</b> de tu celular.</p>
    <a href="#" class="abrir-navegador-continuar" id="continuar-aqui">Continuar aquí de todos modos</a>`;
  caja.hidden = false;

  const copiar = document.getElementById('copiar-enlace-navegador');
  if (copiar) {
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url.href);
        copiar.textContent = 'Enlace copiado ✓ — pégalo en Safari';
      } catch (e) {
        window.prompt('Copia este enlace y ábrelo en Safari:', url.href);
      }
    });
  }

  document.getElementById('continuar-aqui').addEventListener('click', (e) => {
    e.preventDefault();
    caja.hidden = true;
    ocultables.forEach((el) => {
      el.hidden = false;
    });
  });
})();
