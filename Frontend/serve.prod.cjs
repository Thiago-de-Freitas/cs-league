/**
 * Servidor de produção do Angular: arquivos estáticos + proxy /api e /uploads para a API.
 * Usado pelo serviço gamers-league-front na Railway (deploy separado da API).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = Number(process.env.PORT) || 4200;
const HOST = '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const rawApiUrl = (process.env.API_URL || '').trim();
const API_URL = (rawApiUrl || 'http://localhost:3000').replace(/\/+$/, '');
const distPath = path.join(__dirname, 'dist/gamers-league/browser');
const PROXY_TIMEOUT_MS = 300_000;
const SERVER_TIMEOUT_MS = 300_000;

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error(`[front] Build não encontrado em ${distPath}. Rode npm run build antes.`);
  process.exit(1);
}

if (isProduction) {
  if (!rawApiUrl) {
    console.error('[front] API_URL é obrigatória em produção (URL pública do gamers-league-back, sem /api no final).');
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/i.test(API_URL)) {
    console.error(`[front] API_URL aponta para localhost (${API_URL}). Use a URL pública da API na Railway.`);
    process.exit(1);
  }
  if (rawApiUrl.includes('${{') || rawApiUrl.includes('{{')) {
    console.error(`[front] API_URL não foi resolvida: ${rawApiUrl}`);
    process.exit(1);
  }
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/') ||
    pathname === '/uploads' || pathname.startsWith('/uploads/');
}

// Liveness — healthcheck Railway (não passa pelo proxy da API)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'gamers-league-front' });
});

// Config em runtime — browser usa proxy same-origin para uploads em blocos
app.get('/runtime-config.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ apiBaseUrl: API_URL });
});

// Estáticos ANTES do proxy — evita que assets (.js) passem pelo proxy da API
app.use(
  express.static(distPath, {
    index: false,
    dotfiles: 'deny',
    fallthrough: true,
    maxAge: isProduction ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

app.use(
  createProxyMiddleware({
    target: API_URL,
    changeOrigin: true,
    xfwd: true,
    secure: process.env.PROXY_INSECURE !== 'true',
    proxyTimeout: PROXY_TIMEOUT_MS,
    timeout: PROXY_TIMEOUT_MS,
    pathFilter: (pathname) => isApiPath(pathname),
    on: {
      error(err, _req, res) {
        console.error('[front] proxy error:', err.message);
        if (!res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Não foi possível contatar a API. Verifique API_URL no serviço gamers-league-front.',
            detail: err.message,
          }));
        }
      },
    },
  }),
);

// SPA fallback — só GET em rotas que não são API nem arquivo estático
app.get('*', (req, res, next) => {
  if (isApiPath(req.path)) {
    return res.status(502).json({
      error: 'Proxy /api não encaminhou a requisição. Redeploy o gamers-league-front com serve.prod.cjs atualizado.',
      path: req.path,
    });
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[front] Servindo ${distPath}`);
  console.log(`[front] http://${HOST}:${PORT} — proxy /api e /uploads -> ${API_URL}`);
  console.log(`[front] server timeout ${SERVER_TIMEOUT_MS}ms`);
});

server.timeout = SERVER_TIMEOUT_MS;
if (typeof server.requestTimeout !== 'undefined') {
  server.requestTimeout = SERVER_TIMEOUT_MS;
}
if (typeof server.headersTimeout !== 'undefined') {
  server.headersTimeout = SERVER_TIMEOUT_MS + 5000;
}
