const crypto = require('crypto');

const MINIMO = 8;

// Devuelve un mensaje de error o null si la nueva contrasena es valida.
function errorDeNuevaPassword(nueva, confirmacion) {
  if (typeof nueva !== 'string' || nueva.length < MINIMO) {
    return `La nueva contraseña debe tener al menos ${MINIMO} caracteres`;
  }
  if (nueva.length > 200) return 'La nueva contraseña es demasiado larga';
  if (confirmacion !== undefined && nueva !== confirmacion) {
    return 'La confirmación no coincide con la nueva contraseña';
  }
  return null;
}

// Contrasena temporal legible (sin 0/O/1/l/I para que no se confundan al dictarla).
function generarTemporal(largo = 10) {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(largo);
  let salida = '';
  for (let i = 0; i < largo; i++) salida += alfabeto[bytes[i] % alfabeto.length];
  return salida;
}

// true si el token (iat en segundos) es anterior al ultimo cambio de contrasena.
function tokenAnteriorAlCambio(iat, passwordCambiadoEn) {
  if (!passwordCambiadoEn || typeof iat !== 'number') return false;
  return iat < Math.floor(new Date(passwordCambiadoEn).getTime() / 1000);
}

module.exports = { errorDeNuevaPassword, generarTemporal, tokenAnteriorAlCambio };
