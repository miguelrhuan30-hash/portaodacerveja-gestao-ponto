// Hashing via Web Crypto API (nativa no browser e no Node 18+)
// Sem dependências externas.

export async function hashPassword(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain + 'pdc_salt_2026'); // salt fixo por app
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  // Detecta se o hash armazenado é SHA-256 (64 chars hex) ou texto puro
  if (storedHash.length === 64 && /^[0-9a-f]+$/.test(storedHash)) {
    const inputHash = await hashPassword(plain);
    return inputHash === storedHash;
  }
  // Texto puro — comparação legada para migração
  return plain === storedHash;
}

export function generateSessionToken(): string {
  // crypto.randomUUID disponível em browsers modernos e Node 18+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para ambientes mais antigos
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
