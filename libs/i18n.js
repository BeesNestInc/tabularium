import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let messages = {};

const parseLang = (loc) => {
  if (!loc) return 'en';
  return loc.split('.')[0].split('_')[0];
};

export const setLocale = (loc) => {
  const lang = parseLang(loc);
  try {
    const file = path.join(__dirname, 'locales', `${lang}.json`);
    if (existsSync(file)) {
      messages = JSON.parse(readFileSync(file, 'utf-8'));
    } else {
      messages = {};
    }
  } catch {
    messages = {};
  }
};

const fmt = (msg, args) => {
  if (args.length === 0) return msg;
  return msg.replace(/\{(\d+)\}/g, (_, idx) => {
    const i = Number(idx);
    return i < args.length ? String(args[i]) : `{${idx}}`;
  });
};

export const t = (key, ...args) => {
  const msg = messages[key] ?? key;
  return fmt(msg, args);
};

// auto-init on import
setLocale(process.env.LANG);
