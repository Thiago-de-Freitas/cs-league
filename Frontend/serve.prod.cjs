/**
 * Servidor de produção do Angular: arquivos estáticos + proxy /api e /uploads para a API.
 * Usado pelo serviço cs-league-front na Railway (deploy separado da API).
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
const distPath = path.join(__dirname, 'dist/cs-league/browser');

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error(`[front] Build não encontrado em ${distPath}. Rode npm run build antes.`);
  process.exit(1);
}

if (isProduction) {
  if (!rawApiUrl) {
    console.error('[front] API_URL é obrigatória em produção (URL pública do cs-league-back, sem /api no final).');
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1/i.test(API_URL)) {
    console.error(`[front] API_URL aponta para localhost (${API_URL}). Use a URL pública da API na Railway.`);
    process.exit(1);
  }
}

const proxy = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  xfwd: true,
  secure: true,
  on: {
    error(err, _req, res) {
      console.error('[front] proxy error:', err.message);
      if (!res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Não foi possível contatar a API. Verifique API_URL no serviço cs-league-front.',
          detail: err.message,
        }));
      }
    },
  },
});

app.use('/api', proxy);
app.use('/uploads', proxy);

app.use(express.static(distPath, { index: false, dotfiles: 'deny', fallthrough: true }));

app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[front] Servindo ${distPath}`);
  console.log(`[front] http://${HOST}:${PORT} — proxy /api e /uploads -> ${API_URL}`);
});
