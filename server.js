const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// O Cloud Run exige que o app ouça a porta definida na variável PORT
const port = process.env.PORT || 8080;

// Rota especial para o index.html: injeta variáveis de ambiente de forma segura
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Injeta a API Key do Gemini como variável global no browser
  // A chave vem da variável de ambiente do Cloud Run (nunca fica no código)
  const apiKey = process.env.GEMINI_API_KEY || '';
  const injection = `<script>window.__GEMINI_API_KEY__ = ${JSON.stringify(apiKey)};</script>`;
  html = html.replace('</head>', `  ${injection}\n</head>`);

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Arquivos estáticos (JS, CSS, imagens, manifest, service-worker, etc.)
app.use(express.static(__dirname));

// Rota coringa para SPA — garante que refresh em qualquer rota funcione
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Portão da Cerveja rodando na porta ${port}`);
  console.log(`Biometria Gemini: ${process.env.GEMINI_API_KEY ? '✅ Configurada' : '⚠️  Sem API key (fallback ativado)'}`);
});