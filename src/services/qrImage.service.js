const QRCode = require('qrcode');
const env = require('../config/env');

function urlCheckin(token) {
  return `${env.baseUrl}/checkin/${token}`;
}

async function generarPngBuffer(token) {
  return QRCode.toBuffer(urlCheckin(token), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320
  });
}

module.exports = { urlCheckin, generarPngBuffer };
