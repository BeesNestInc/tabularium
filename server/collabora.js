import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { t } from './libs/i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocal = path.join(__dirname, '.env');
const envParent = path.join(__dirname, '..', '.env');
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (existsSync(envParent)) {
  dotenv.config({ path: envParent });
}

const ENGINE = process.env.COLLABORA_ENGINE || ''; // force 'podman' or 'docker'
const IMAGE = process.env.COLLABORA_IMAGE || 'docker.io/collabora/code';
const CONTAINER_NAME = process.env.COLLABORA_CONTAINER_NAME || 'legion-cool';
const PORT_MAPPING = process.env.COLLABORA_PORT || '9980:9980';
const EXTRA_ARGS = process.env.COLLABORA_EXTRA_ARGS || '';
const WOPI_SRC = process.env.WOPI_SRC || '';

function detectEngine() {
  if (ENGINE) return ENGINE;
  const check = (cmd) => {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf-8' });
    return result.status === 0;
  };
  if (check('podman')) return 'podman';
  if (check('docker')) return 'docker';
  return null;
}

function run(args, opts = {}) {
  const engine = detectEngine();
  if (!engine) throw new Error(t('No container engine found (podman or docker)'));
  return spawn(engine, args, { stdio: opts.stdio ?? 'inherit', ...opts });
}

function runSync(args) {
  const engine = detectEngine();
  if (!engine) throw new Error(t('No container engine found (podman or docker)'));
  const result = spawnSync(engine, args, { encoding: 'utf-8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr?.trim() || t('Command failed with code {0}', result.status));
  return result.stdout;
}

export async function status() {
  const engine = detectEngine();
  if (!engine) return { running: false, engine: null, error: t('No container engine found') };

  try {
    const inspect = runSync(['ps', '-a', '--filter', `name=${CONTAINER_NAME}`, '--format', '{{.ID}}|{{.Status}}|{{.Image}}|{{.Ports}}']);
    const lines = inspect.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      return { running: false, engine, containerName: CONTAINER_NAME, image: IMAGE, exists: false };
    }
    const [id, statusStr, image, ports] = lines[0].split('|');
    const running = statusStr ? statusStr.startsWith('Up') : false;

    let hostPort = PORT_MAPPING.split(':')[0];
    try {
      const portInfo = runSync(['port', CONTAINER_NAME, '9980']).trim();
      if (portInfo) {
        hostPort = portInfo.split(':').pop();
      }
    } catch {}

    return {
      running,
      engine,
      containerName: CONTAINER_NAME,
      image,
      containerId: id,
      status: statusStr ?? 'unknown',
      ports,
      hostPort,
      exists: true,
    };
  } catch (err) {
    return { running: false, engine, containerName: CONTAINER_NAME, error: err.message };
  }
}

function runAndCapture(args) {
  const engine = detectEngine();
  if (!engine) throw new Error(t('No container engine found (podman or docker)'));
  return new Promise((resolve, reject) => {
    const proc = spawn(engine, args, { stdio: ['inherit', 'inherit', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      resolve({ code, stderr: stderr.trim() });
    });
    proc.on('error', reject);
  });
}

export async function start() {
  const engine = detectEngine();
  if (!engine) return { ok: false, error: t('No container engine found (podman or docker)') };

  const st = await status();
  if (st.running) return { ok: true, message: t('Container already running'), containerName: CONTAINER_NAME };

  const runArgs = ['run', '-d', '--name', CONTAINER_NAME, '--restart', 'unless-stopped', '--network', 'host', '-p', PORT_MAPPING];

  if (WOPI_SRC) {
    runArgs.push('-e', `domain=.*`);
    runArgs.push('-e', `DONT_GEN_SSL_CERT=1`);
    runArgs.push('-e', `dictionaries=en_US ja_JP`);
    if (process.env.COLLABORA_USERNAME && process.env.COLLABORA_PASSWORD) {
      runArgs.push('-e', `username=${process.env.COLLABORA_USERNAME}`);
      runArgs.push('-e', `password=${process.env.COLLABORA_PASSWORD}`);
    }
  }
  const coolServerName = process.env.COLLABORA_SERVER_NAME;
  if (coolServerName) {
    runArgs.push('-e', `server_name=${coolServerName}`);
  }

  const extraParams = [
    '--o:ssl.enable=false',
    `--o:net.content_security_policy=script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
    '--o:limit_load_secs=300',
  ];
  if (process.env.COLLABORA_EXTRA_PARAMS) {
    extraParams.push(...process.env.COLLABORA_EXTRA_PARAMS.split(/\s+/));
  }

  runArgs.push(...EXTRA_ARGS.split(/\s+/).filter(Boolean), IMAGE, ...extraParams);

  const args = st.exists ? ['start', CONTAINER_NAME] : runArgs;

  const { code, stderr } = await runAndCapture(args);
  if (code === 0) {
    return { ok: true, message: st.exists ? t('Container started') : t('Container created and started'), containerName: CONTAINER_NAME };
  }
  return { ok: false, error: t('Container start failed (code {0}): {1}', code, stderr || 'unknown error') };
}

export async function stop() {
  const engine = detectEngine();
  if (!engine) return { ok: false, error: t('No container engine found') };

  const st = await status();
  if (!st.exists) return { ok: true, message: t('Container does not exist') };
  if (!st.running) return { ok: true, message: t('Container already stopped') };

  const { code, stderr } = await runAndCapture(['stop', CONTAINER_NAME]);
  if (code === 0) return { ok: true, message: t('Container stopped'), containerName: CONTAINER_NAME };
  return { ok: false, error: t('Container stop failed (code {0}): {1}', code, stderr || 'unknown error') };
}

export async function remove() {
  const engine = detectEngine();
  if (!engine) return { ok: false, error: t('No container engine found') };

  const st = await status();
  if (!st.exists) return { ok: true, message: t('Container does not exist') };

  if (st.running) {
    const stopResult = await stop();
    if (!stopResult.ok) return stopResult;
  }

  const { code, stderr } = await runAndCapture(['rm', CONTAINER_NAME]);
  if (code === 0) return { ok: true, message: t('Container removed'), containerName: CONTAINER_NAME };
  return { ok: false, error: t('Container remove failed (code {0}): {1}', code, stderr || 'unknown error') };
}

export async function logs(lines = 50) {
  const engine = detectEngine();
  if (!engine) return { ok: false, error: t('No container engine found') };

  const st = await status();
  if (!st.exists) return { ok: false, error: t('Container does not exist') };

  try {
    const output = runSync(['logs', '--tail', String(lines), CONTAINER_NAME]);
    return { ok: true, logs: output };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function cli() {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'start':
      try {
        const result = await start();
        printJson(result);
      } catch (err) {
        printJson({ ok: false, error: err.message });
        process.exit(1);
      }
      break;
    case 'stop':
      try {
        const result = await stop();
        printJson(result);
      } catch (err) {
        printJson({ ok: false, error: err.message });
        process.exit(1);
      }
      break;
    case 'status':
      printJson(await status());
      break;
    case 'logs':
      printJson(await logs(parseInt(process.argv[3], 10) || 50));
      break;
    case 'remove':
      try {
        const result = await remove();
        printJson(result);
      } catch (err) {
        printJson({ ok: false, error: err.message });
        process.exit(1);
      }
      break;
    case 'engine':
      printJson({ engine: detectEngine() });
      break;
    default:
      console.log(`Usage: node collabora.js <command>

Commands:
  start          Start Collabora Online container
  stop           Stop Collabora Online container
  status         Show container status
  logs [lines]   Show container logs (default: 50)
  remove         Stop and remove container
  engine         Show detected container engine

Environment:
  COLLABORA_ENGINE         Force engine (podman|docker)
  COLLABORA_IMAGE          Container image (default: collabora/code)
  COLLABORA_PORT           Port mapping (default: 9980:9980)
  COLLABORA_CONTAINER_NAME Container name (default: legion-cool)
  COLLABORA_EXTRA_ARGS     Extra arguments for podman/docker run
`);
      process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  cli();
}
