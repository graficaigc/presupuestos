// Envuelve un handler async para que cualquier excepción/rechazo llegue a
// next(err) en vez de tirar abajo el proceso (Express 4 no atrapa async errors solo).
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
