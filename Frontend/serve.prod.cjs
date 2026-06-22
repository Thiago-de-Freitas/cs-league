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
const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const distPath = path.join(__dirname, 'dist/cs-league/browser');

if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error(`[front] Build não encontrado em ${distPath}. Rode npm run build antes.`);
  process.exit(1);
}

const proxy = createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  xfwd: true,
});

app.use('/api', proxy);
app.use('/uploads', proxy);

app.use(express.static(distPath, { index: false, dotfiles: 'deny', fallthrough: true }));

app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[front] Servindo ${distPath}`);
  console.log(`[front] http://${HOST}:${PORT} — proxy API -> ${API_URL}`);
});
