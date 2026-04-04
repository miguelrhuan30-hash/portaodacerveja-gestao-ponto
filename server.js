const express = require('express');
const path = require('path');
const helmet = require('helmet');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 8080;

// ── Segurança: headers HTTP ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '3mb' }));

// ── Rate limiting simples (sem dependência extra) ─────────────────
const requestCounts = new Map();
function rateLimit(maxReq, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const entry = requestCounts.get(ip) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    requestCounts.set(ip, entry);
    if (entry.count > maxReq) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 minuto.' });
    }
    next();
  };
}

// ── Proxy Gemini — análise biométrica ────────────────────────────
app.post('/api/analyze-face', rateLimit(10, 60_000), async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 é obrigatório' });
    }
    if (imageBase64.length > 2_500_000) {
      return res.status(400).json({ error: 'Imagem muito grande. Máximo ~1.5MB.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback gracioso: sem key, retorna "humano" para não bloquear o ponto
      console.warn('[proxy] GEMINI_API_KEY não configurada. Usando fallback.');
      return res.json({ isHuman: true, confidence: 0, details: 'Biometria desativada (sem API key).' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        },
      },
      {
        text: `Analise esta imagem.
        Responda APENAS com um JSON no formato:
        {"isHuman": true/false, "confidence": 0.0-1.0, "details": "descrição curta"}
        isHuman deve ser true apenas se houver um rosto humano real e vivo visível.`,
      },
    ]);

    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.json(parsed);
  } catch (err) {
    console.error('[proxy] Erro na análise biométrica:', err.message);
    return res.status(500).json({ error: 'Falha na análise biométrica' });
  }
});

// ── Arquivos estáticos (pasta dist compilada pelo Vite) ───────────
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// ── SPA fallback: todas as rotas retornam index.html ─────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Servidor Portão da Cerveja na porta ${port}`);
  console.log(`🔒 Helmet: ativo`);
  console.log(`📦 Servindo build de: ${distPath}`);
  console.log(`🤖 Gemini proxy: ${process.env.GEMINI_API_KEY ? '✅ Configurado' : '⚠️  Sem API key (fallback ativado)'}`);
});
