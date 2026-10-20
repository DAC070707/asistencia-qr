function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatearHora(iso) {
  return new Date(iso).toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// "fecha" es una columna DATE (sin hora): Postgres la sirve como medianoche
// UTC. Reinterpretarla en hora de Lima (como si fuera un instante real) la
// corre al dia anterior, asi que aca solo se extrae la parte de fecha tal
// cual, sin aplicar huso horario.
function formatearFecha(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

// Convierte un instante ISO a "YYYY-MM-DDTHH:mm" en hora de Lima, para
// precargar un <input type="datetime-local">.
function toLimaInputValue(iso) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(iso));
  const get = (t) => partes.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function hoyLimaISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function badgeEstado(estado) {
  const textos = { pendiente: '⏳ Pendiente', aprobado: '✅ Aprobado', rechazado: '❌ Rechazado' };
  return `<span class="badge badge-${estado}">${textos[estado] || estado}</span>`;
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

function badgeMarcacion(estado, minutos) {
  if (!estado) return '';
  const textos = {
    a_tiempo: 'A tiempo',
    tarde: 'Tarde',
    temprano: 'Temprano',
    fuera_de_horario: 'Fuera de horario'
  };
  const texto = textos[estado] || estado;
  const sufijo = typeof minutos === 'number' ? ` · ${minutos} min` : '';
  return `<br><span class="badge badge-${estado}">${texto}${sufijo}</span>`;
}

const desdeInput = document.getElementById('desde-input');
const hastaInput = document.getElementById('hasta-input');
let conRefrigerio = false;
// Permisos de la sesion (se cargan al inicio); por defecto todo visible.
let puede = { corregir_marcaciones: true, aprobar_horas_extra: true };
let etiquetaExtra1 = 'Extra 25%';
let etiquetaExtra2 = 'Extra 35%';
const workerInput = document.getElementById('worker-input');
const sucursalInput = document.getElementById('sucursal-input');
const tbody = document.getElementById('tabla-historial');
const exportLink = document.getElementById('export-link');

async function cargarWorkers() {
  const resp = await fetch('/api/admin/workers');
  if (!resp.ok) return;
  const workers = await resp.json();
  workerInput.innerHTML =
    '<option value="">Todos</option>' +
    workers
      .map((w) => `<option value="${w.id}">${escapeHtml(w.nombre)} (${escapeHtml(w.dni)})</option>`)
      .join('');
}

async function cargarSucursales() {
  const resp = await fetch('/api/admin/sucursales');
  if (!resp.ok) return;
  const sucursales = await resp.json();
  if (sucursales.length < 2) return;
  sucursalInput.innerHTML =
    '<option value="">Todas</option>' +
    sucursales.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
  document.getElementById('sucursal-filtro').hidden = false;
}

async function cargarConfigRefrigerio() {
  const resp = await fetch('/api/admin/empresa/configuracion');
  if (!resp.ok) return;
  const config = await resp.json();
  conRefrigerio = Boolean(config.controlaRefrigerio);
  document.querySelectorAll('.col-refrigerio').forEach((th) => {
    th.hidden = !conRefrigerio;
  });

  // Obreros: filtro por tipo, atajos de semana y rotulos de horas extra.
  const pe = config.porcentajesExtra?.empleado || { tramo1: 25, tramo2: 35 };
  const po = config.porcentajesExtra?.obrero || pe;
  const mismos = !config.gestionaObreros || (pe.tramo1 === po.tramo1 && pe.tramo2 === po.tramo2);
  etiquetaExtra1 = mismos ? `Extra ${pe.tramo1}%` : 'Extra 1er tramo';
  etiquetaExtra2 = mismos ? `Extra ${pe.tramo2}%` : 'Extra 2do tramo';
  document.getElementById('th-extra-1').textContent = etiquetaExtra1;
  document.getElementById('th-extra-2').textContent = etiquetaExtra2;
  if (!mismos) {
    document.getElementById('th-extra-1').title = `Empleados ${pe.tramo1}% · Obreros ${po.tramo1}%`;
    document.getElementById('th-extra-2').title = `Empleados ${pe.tramo2}% · Obreros ${po.tramo2}%`;
  }
  if (config.gestionaObreros) {
    document.getElementById('tipo-filtro').hidden = false;
    document.getElementById('semana-atajos').hidden = false;
  }
}

// Lunes de la semana de una fecha YYYY-MM-DD (semana de lunes a domingo).
function lunesDe(fechaTxt) {
  const d = new Date(`${fechaTxt}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

function ponerSemana(desplazamiento) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const lunes = lunesDe(hoy);
  lunes.setUTCDate(lunes.getUTCDate() + desplazamiento * 7);
  const domingo = new Date(lunes);
  domingo.setUTCDate(domingo.getUTCDate() + 6);
  desdeInput.value = lunes.toISOString().slice(0, 10);
  hastaInput.value = domingo.toISOString().slice(0, 10);
  buscar();
}

document.getElementById('esta-semana-btn').addEventListener('click', () => ponerSemana(0));
document.getElementById('semana-pasada-btn').addEventListener('click', () => ponerSemana(-1));

function celdasRefrigerioHtml(r) {
  if (!conRefrigerio) return '';
  const fmt = (v) => (v ? formatearHora(v) : '—');
  return `<td class="c-refrigerio sep-movil" data-label="Sale a refrigerio">${fmt(r.refrigerio_salida_en)}</td><td class="c-refrigerio sep-movil" data-label="Regresa">${fmt(r.refrigerio_regreso_en)}</td>`;
}

function paramsActuales() {
  const params = new URLSearchParams({ desde: desdeInput.value, hasta: hastaInput.value });
  if (workerInput.value) params.set('worker_id', workerInput.value);
  if (sucursalInput.value) params.set('sucursal_id', sucursalInput.value);
  const tipo = document.getElementById('tipo-input').value;
  if (tipo) params.set('tipo', tipo);
  return params;
}

function actualizarExportLink() {
  exportLink.href = `/api/admin/attendance/export.xlsx?${paramsActuales().toString()}`;
}

// Celular: debajo de la fecha, "📍 Sucursal • distancia" (como en la referencia).
function lugarMovil(r) {
  const partes = [];
  if (r.sucursal_nombre) partes.push(escapeHtml(r.sucursal_nombre));
  if (r.entrada_distancia_m !== null && r.entrada_distancia_m !== undefined) partes.push(`${Number(r.entrada_distancia_m).toFixed(0)} m`);
  return partes.length ? `<span class="sub-fila solo-movil">📍 ${partes.join(' • ')}</span>` : '';
}

// "Corregido por Juan · 20/10 09:15" bajo la entrada, si un usuario la corrigio.
function corregidoPorHtml(r) {
  if (!r.editado_en || !r.editado_por_nombre) return '';
  const cuando = new Date(r.editado_en).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `<span class="auditoria">Corregido por ${escapeHtml(r.editado_por_nombre)} · ${cuando}</span>`;
}

function filaHtml(r) {
  const tieneExtra = Number(r.horas_extra_25) > 0 || Number(r.horas_extra_35) > 0;
  return `
    <tr data-id="${r.id}" data-entrada="${r.creado_en}" data-salida="${r.hora_salida || ''}" data-fecha="${formatearFecha(r.fecha)}" data-nombre="${escapeHtml(r.nombre)}" data-dni="${escapeHtml(r.dni)}">
      <td class="c-fecha">${formatearFecha(r.fecha)}${lugarMovil(r)}</td>
      <td class="c-nombre"><div class="name-cell"><div class="name-avatar">${iniciales(r.nombre)}</div><div><span class="nombre-fila">${escapeHtml(r.nombre)}</span><span class="sub-fila solo-movil">DNI: ${escapeHtml(r.dni)}</span></div></div></td>
      <td class="c-dni">${escapeHtml(r.dni)}</td>
      <td class="celda-entrada c-entrada sep-movil" data-label="Entrada">${formatearHora(r.creado_en)}${badgeMarcacion(r.entrada_estado, r.entrada_minutos)}${corregidoPorHtml(r)}</td>
      <td class="celda-salida c-salida sep-movil" data-label="Salida">${r.hora_salida ? formatearHora(r.hora_salida) : '—'}${badgeMarcacion(r.salida_estado, r.salida_minutos)}</td>
      <td class="c-pendientes sep-movil" data-label="Pendientes">${r.horas_pendientes === null || r.horas_pendientes === undefined ? '—' : `${Number(r.horas_pendientes).toFixed(2)}h`}</td>
      <td class="c-extra1 sep-movil" data-label="${etiquetaExtra1}">${Number(r.horas_extra_25).toFixed(2)}</td>
      <td class="c-extra2 sep-movil" data-label="${etiquetaExtra2}">${Number(r.horas_extra_35).toFixed(2)}</td>
      <td class="celda-estado c-estado sep-movil" data-label="Horas extra">${tieneExtra ? badgeEstado(r.horas_extra_estado) : '—'}${tieneExtra && r.aprobado_por_nombre && r.horas_extra_estado !== 'pendiente' ? `<span class="auditoria">${r.horas_extra_estado === 'aprobado' ? 'Aprobado' : 'Rechazado'} por ${escapeHtml(r.aprobado_por_nombre)}</span>` : ''}</td>
      ${celdasRefrigerioHtml(r)}
      <td class="c-distancia">${r.entrada_distancia_m === null || r.entrada_distancia_m === undefined ? '—' : `${Number(r.entrada_distancia_m).toFixed(0)} m`}</td>
      <td class="c-sucursal">${r.sucursal_nombre ? escapeHtml(r.sucursal_nombre) : '—'}</td>
      <td class="celda-acciones c-acciones">
        ${puede.corregir_marcaciones ? '<button type="button" class="boton-mini secundario editar-btn">Editar</button>' : ''}
        ${
          puede.aprobar_horas_extra && tieneExtra && r.horas_extra_estado !== 'aprobado'
            ? '<button type="button" class="boton-mini aprobar-btn">Aprobar</button>'
            : ''
        }
        ${
          puede.aprobar_horas_extra && tieneExtra && r.horas_extra_estado !== 'rechazado'
            ? '<button type="button" class="boton-mini secundario rechazar-btn">Rechazar</button>'
            : ''
        }
      </td>
    </tr>`;
}

function filaEdicionHtml(fila) {
  const entrada = fila.dataset.entrada ? toLimaInputValue(fila.dataset.entrada) : '';
  const salida = fila.dataset.salida ? toLimaInputValue(fila.dataset.salida) : '';
  const nombre = fila.dataset.nombre;
  const dni = fila.dataset.dni;
  const fecha = fila.dataset.fecha;

  fila.innerHTML = `
    <td class="c-fecha">${escapeHtml(fecha)}</td>
    <td class="c-nombre"><span class="nombre-fila">${escapeHtml(nombre)}</span><span class="sub-fila solo-movil">DNI: ${escapeHtml(dni)}</span></td>
    <td class="c-dni">${escapeHtml(dni)}</td>
    <td class="c-edicion sep-movil" data-label="Entrada"><input type="datetime-local" class="input-entrada" value="${entrada}" /></td>
    <td class="c-edicion" data-label="Salida"><input type="datetime-local" class="input-salida" value="${salida}" /></td>
    <td class="c-vacio" colspan="3"></td>
    <td class="c-vacio"></td>
    ${conRefrigerio ? '<td class="c-vacio"></td><td class="c-vacio"></td>' : ''}
    <td class="c-vacio"></td>
    <td class="c-vacio"></td>
    <td class="celda-acciones c-acciones">
      <button type="button" class="boton-mini guardar-btn">Guardar</button>
      <button type="button" class="boton-mini secundario cancelar-btn">Cancelar</button>
    </td>`;
}

async function buscar() {
  if (!desdeInput.value || !hastaInput.value) return;

  actualizarExportLink();
  tbody.innerHTML = '<tr><td colspan="14">Cargando...</td></tr>';

  const resp = await fetch(`/api/admin/attendance?${paramsActuales().toString()}`);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    tbody.innerHTML = `<tr><td colspan="14">${data.error || 'Error al cargar'}</td></tr>`;
    return;
  }
  const registros = await resp.json();

  if (registros.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14">Sin registros para este filtro</td></tr>';
    return;
  }

  tbody.innerHTML = registros.map(filaHtml).join('');
}

tbody.addEventListener('click', async (e) => {
  const fila = e.target.closest('tr');
  if (!fila) return;
  const id = fila.dataset.id;

  if (e.target.classList.contains('editar-btn')) {
    filaEdicionHtml(fila);
    return;
  }

  if (e.target.classList.contains('cancelar-btn')) {
    return buscar();
  }

  if (e.target.classList.contains('guardar-btn')) {
    const horaEntrada = fila.querySelector('.input-entrada').value;
    const horaSalida = fila.querySelector('.input-salida').value;
    e.target.disabled = true;
    e.target.textContent = 'Guardando...';
    await fetch(`/api/admin/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hora_entrada: horaEntrada, hora_salida: horaSalida || null })
    });
    return buscar();
  }

  if (e.target.classList.contains('aprobar-btn') || e.target.classList.contains('rechazar-btn')) {
    const estado = e.target.classList.contains('aprobar-btn') ? 'aprobado' : 'rechazado';
    e.target.disabled = true;
    await fetch(`/api/admin/attendance/${id}/horas-extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    });
    return buscar();
  }
});

document.getElementById('buscar-btn').addEventListener('click', buscar);
document.getElementById('logout-link').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

desdeInput.value = hoyLimaISO();
hastaInput.value = hoyLimaISO();
cargarWorkers();
cargarSucursales();
Promise.all([
  cargarConfigRefrigerio(),
  fetch('/api/auth/me')
    .then((r) => (r.ok ? r.json() : null))
    .then((sesion) => {
      if (sesion && sesion.puede) puede = sesion.puede;
    })
    .catch(() => {})
]).then(buscar);
