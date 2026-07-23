import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const targetDir = path.join(projectRoot, 'public', 'drawio');
const markerFile = path.join(targetDir, '.download-stamp');

// draw.io embed frontend is distributed as draw.war (a ZIP containing HTML/JS/CSS).
// We only need the frontend part; the Java backend is irrelevant for Tabularium.
const DRAWIO_VERSION = '30.4.3';
const DOWNLOAD_URL = `https://github.com/jgraph/drawio/releases/download/v${DRAWIO_VERSION}/draw.war`;

const download = (url, dest) => new Promise((resolve, reject) => {
  const file = createWriteStream(dest);
  get(url, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      file.close();
      download(res.headers.location, dest).then(resolve).catch(reject);
      return;
    }
    if (res.statusCode !== 200) {
      file.close();
      reject(new Error(`HTTP ${res.statusCode}`));
      return;
    }
    res.pipe(file);
    file.on('finish', () => { file.close(); resolve(); });
  }).on('error', (err) => { file.close(); reject(err); });
});

const main = async () => {
  if (existsSync(markerFile)) {
    const stamp = readFileSync(markerFile, 'utf-8').trim();
    if (stamp === DRAWIO_VERSION) {
      console.log(`draw.io ${DRAWIO_VERSION} already downloaded.`);
      return;
    }
    console.log(`Updating draw.io from ${stamp} to ${DRAWIO_VERSION}...`);
  } else {
    console.log(`Downloading draw.io ${DRAWIO_VERSION}...`);
  }

  const warPath = path.join(projectRoot, '.tmp-drawio.war');
  mkdirSync(path.dirname(warPath), { recursive: true });

  try {
    console.log(`  GET ${DOWNLOAD_URL}`);
    await download(DOWNLOAD_URL, warPath);

    // WAR is a ZIP containing the frontend at root level (index.html, js/, etc.)
    mkdirSync(targetDir, { recursive: true });
    spawnSync('unzip', ['-o', warPath, '-d', targetDir], { stdio: 'inherit', cwd: projectRoot });

    // Remove Java backend files (WEB-INF, META-INF) — not needed for embed
    spawnSync('rm', ['-rf', path.join(targetDir, 'WEB-INF'), path.join(targetDir, 'META-INF')]);

    writeFileSync(markerFile, DRAWIO_VERSION, 'utf-8');
    console.log(`draw.io ${DRAWIO_VERSION} installed to public/drawio/`);
  } catch (err) {
    console.error(`Failed to download draw.io: ${err.message}`);
    console.log('Falling back to embed.diagrams.net (set DRAWIO_URL env to override).');
  } finally {
    try { spawnSync('rm', [warPath]); } catch {}
  }
};

main();
