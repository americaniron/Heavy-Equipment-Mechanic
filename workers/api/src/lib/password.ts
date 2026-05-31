// Simple hash for testing
export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password + "salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === stored;
}
