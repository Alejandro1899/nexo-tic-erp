import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/** Contraseña temporal legible de 12 caracteres (sin 0/O/1/l/I para no confundirla al dictarla). */
export function generarPasswordTemporal(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Formato: scrypt$<sal base64>$<hash base64>. Sin dependencias nativas. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(pw: string, guardado: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = guardado.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, "base64");
  const obtenido = await scrypt(pw, Buffer.from(saltB64, "base64"), esperado.length);
  return esperado.length === obtenido.length && timingSafeEqual(esperado, obtenido);
}
