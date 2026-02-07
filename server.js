const express = require('express');
const path = require('path');
const app = express();

// O Cloud Run exige que o app ouça a porta definida na variável PORT
const port = process.env.PORT || 8080;

// Configura o servidor para entregar os arquivos estáticos
// Se você estiver usando um processo de build, use 'build'. 
// Para este ambiente de desenvolvimento direto, usamos a raiz.
app.use(express.static(__dirname));

// Rota coringa para garantir que o React Router (SPA) funcione corretamente
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Portão da Cerveja rodando na porta ${port}`);
});