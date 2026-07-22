import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();

const parseLang = (loc) => {
  if (!loc) return null;
  return loc.split('.')[0].split('_')[0];
};

const loadLocale = (lang) => {
  let msgs = cache.get(lang);
  if (msgs !== undefined) return msgs;
  try {
    const file = path.join(__dirname, 'locales', `${lang}.json`);
    if (existsSync(file)) {
      msgs = JSON.parse(readFileSync(file, 'utf-8'));
    } else {
      msgs = {};
    }
  } catch {
    msgs = {};
  }
  cache.set(lang, msgs);
  return msgs;
};

// preload on startup
const defaultLang = parseLang(process.env.LANG) || 'en';
loadLocale('en');
loadLocale('ja');
loadLocale('zh');

let messages = loadLocale(defaultLang);

export const setLocale = (loc) => {
  const lang = loc ? parseLang(loc) : defaultLang;
  if (lang) messages = loadLocale(lang);
};

export const parseAcceptLanguage = (header) => {
  if (!header) return '';
  // simple: first tag, strip weight, normalize
  const tag = header.split(',')[0].trim().split(';')[0];
  if (!tag) return '';
  return tag;
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

// auto-init from env
setLocale(process.env.LANG);
