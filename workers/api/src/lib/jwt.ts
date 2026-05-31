import { signingKeyAlias } from "./env";

// Create signed JWT-like token stored in KV
export async function createjwt(payload: Record<string, unknown>, env: { AUTH_KV: KVNamespace }): Promise<string> {
  const token = crypto.randomUUID();
  const expires = Math.floor(Date.now() / 1000) + 86400; // 24 hours
  
  await env.AUTH_KV.put(token, JSON.stringify({ ...payload, exp: expires }), { expirationTtl: 86400 });
  
  return token;
}

export async function verifyjwt(token: string, env: { AUTH_KV: KVNamespace }): Promise<Record<string, unknown> | null {
  if (!token || !env.AUTH_KV) return null;
  
  const stored = await env.AUTH_KV.get(token);
  if (!stored) return null;
  
  const data = JSON.parse(stored);
  if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
    await env.AUTH_KV.delete(token);
    return null;
  }
  
  return data;
}

export async function destroyjwt(token: string, env: { AUTH_KV: KVNamespace }): Promise<void> {
  if (token && env.AUTH_KV) {
    await env.AUTH_KV.delete(token);
  }
}