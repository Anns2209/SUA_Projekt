const { reportStat } = require('./statsClient');

// Ob koncu vsake zahteve (ne glede na status kodo) sporoči Statistics Service,
// kateri endpoint je bil klican. Middleware ne čaka na odgovor -> ne upočasni
// odziva Order Service uporabniku.
function statsMiddleware(req, res, next) {
  res.on('finish', () => {
    reportStat(req.path);
  });
  next();
}

module.exports = statsMiddleware;