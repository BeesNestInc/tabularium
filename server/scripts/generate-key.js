import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.log('Usage: node server/scripts/generate-key.js <password>');
  console.log();
  console.log('Generates a session key and bcrypt password hash for .env');
  process.exit(1);
}

const key = randomBytes(32).toString('hex');
const hash = bcrypt.hashSync(password, 10);
console.log('WIKI_SESSION_KEY=' + key);
console.log('WIKI_PASSWORD_HASH=' + hash);
