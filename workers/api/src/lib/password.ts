import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  return bcrypt.compare(password, stored);
}
