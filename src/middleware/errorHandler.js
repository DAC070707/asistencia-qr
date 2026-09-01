function errorHandler(err, req, res, next) {
  console.error(err);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  return res.status(500).send('Ocurrio un error interno. Intenta de nuevo en unos minutos.');
}

module.exports = errorHandler;
