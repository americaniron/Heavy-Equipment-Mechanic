// Password hashing using Web Crypto API PBKDF2
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    data,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  // Derive bits
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  
  // Combine salt + hash for storage
  const hashArray = new Uint8Array(bits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    
    // Decode stored
    const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const hash = combined.slice(16);
    
    const key = await crypto.subtle.importKey(
      "raw",
      data,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    
    const computed = new Uint8Array(bits);
    
    // Constant-time comparison
    if (computed.length !== hash.length) return false;
    let result = 0;
    for (let i = 0; i < computed.length; i++) {
      result |= computed[i] ^ hash[i];
    }
    return result === 0;
  } catch {
    return false;
  }
}