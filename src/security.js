import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), await scrypt(password, salt, 64));
}
