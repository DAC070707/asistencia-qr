// Envuelve un controlador async para que sus rechazos lleguen al errorHandler de Express.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
