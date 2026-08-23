const { randomUUID } = require('crypto');
const { publishLog } = require('./logger');

function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || randomUUID();
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}

function requestLoggerMiddleware(req, res, next) {
  res.on('finish', () => {
    let level = 'INFO';
    if (res.statusCode >= 500) level = 'ERROR';
    else if (res.statusCode >= 400) level = 'WARN';

    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    publishLog(level, fullUrl, req.correlationId, `${req.method} ${req.path} -> ${res.statusCode}`);
  });
  next();
}

module.exports = { correlationMiddleware, requestLoggerMiddleware };