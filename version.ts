
export const versionData = {
  "version": "v77.0",
  "deployDate": "2026-04-02",
  "lastChanges": [
    "Segurança: senhas armazenadas com hash SHA-256 (migração automática no login).",
    "Segurança: API key do Gemini movida para proxy server-side (/api/analyze-face).",
    "Segurança: sessão 'lembrar de mim' usa token seguro, sem armazenar senha.",
    "Segurança: headers HTTP de segurança via Helmet.js (CSP, X-Frame-Options, etc.).",
    "Segurança: IDs de tarefas recorrentes usam crypto.randomUUID().",
    "Qualidade: CashRegister atualiza em tempo real via onSnapshot.",
    "Qualidade: sistema de Toast substitui todos os alert() nativos.",
    "Qualidade: timer de turno exibe hh:mm:ss e atualiza a cada 30 segundos.",
    "Qualidade: tarefas recorrentes com horizonte configurável (máx. 365 dias)."
  ]
};
