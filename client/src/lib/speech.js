// 音声出力 (TTS) マネージャ。
// サーバーの /ws/chat ストリームに tts_request を送り、
// 返ってくる WAV チャンク (binary) を AudioContext で順次再生する。
// announce (イベント等のプッシュ発話) もこの接続で受信する。

const SCENE_KEYS = {
  chat: 'chatAutoVoice',
  wiki: 'speechWikiVoice',
  event: 'speechEventVoice',
};

const getCookie = (name) =>
  document.cookie.split('; ').find((r) => r.startsWith(name + '='))?.split('=')[1];

const setCookie = (name, value) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000`;
};

function createManager() {
  let ws = null;
  let wsTimer = null;
  let ctx = null;
  let playHead = 0;
  let generation = 0;
  let activeId = null;
  let speaking = false;
  const pending = [];
  const listeners = new Set();

  const masterEnabled = () => getCookie('speechMaster') !== '0';
  const sceneEnabled = (scene) => getCookie(SCENE_KEYS[scene] || '') !== '0';

  const notify = () => {
    for (const fn of listeners) fn();
  };

  const ensureContext = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      playHead = 0;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const activeSources = new Set();

  const schedule = (buf) => {
    const ac = ensureContext();
    const now = ac.currentTime;
    playHead = Math.max(now + 0.02, playHead);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start(playHead);
    playHead += buf.duration;
    activeSources.add(src);
    src.onended = () => {
      activeSources.delete(src);
      if (playHead <= ac.currentTime + 0.01) {
        speaking = false;
        notify();
      }
    };
  };

  const decodeAndSchedule = async (arrayBuffer, gen) => {
    try {
      const ac = ensureContext();
      const buf = await ac.decodeAudioData(arrayBuffer);
      if (gen !== generation) return;
      speaking = true;
      notify();
      schedule(buf);
    } catch (e) {
      /* デコード失敗は無視 */
    }
  };

  const connect = () => {
    if (ws) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${protocol}//${location.host}/ws/chat`);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        while (pending.length > 0) {
          const req = pending.shift();
          ws.send(JSON.stringify({ type: 'tts_request', ...req }));
        }
      };
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (activeId) decodeAndSchedule(event.data, generation);
          return;
        }
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'tts_audio') {
          activeId = msg.id;
        } else if (msg.type === 'tts_end') {
          activeId = null;
        } else if (msg.type === 'tts_error') {
          activeId = null;
        } else if (msg.type === 'announce' && msg.speech) {
          if (masterEnabled() && sceneEnabled(msg.speech.scene)) {
            speak(msg.speech.text, { scene: msg.speech.scene, persona: msg.speech.persona });
          }
        }
      };
      ws.onclose = () => {
        ws = null;
        wsTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    } catch (e) {
      ws = null;
    }
  };

  const speak = (text, opts = {}) => {
    if (!masterEnabled()) return;
    if (!sceneEnabled(opts.scene)) return;
    if (!text) return;
    const id = 's' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    generation += 1;
    activeId = id;
    const req = { id, text, ...opts };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tts_request', ...req }));
    } else {
      connect();
      pending.push(req);
    }
  };

  const stop = () => {
    generation += 1;
    activeId = null;
    for (const src of activeSources) {
      try { src.stop(); } catch {}
    }
    activeSources.clear();
    if (ctx) playHead = ctx.currentTime;
    speaking = false;
    notify();
  };

  const setEnabled = (scene, value) => {
    const key = SCENE_KEYS[scene];
    if (key) setCookie(key, value ? '1' : '0');
    notify();
  };

  const isEnabled = (scene) => sceneEnabled(scene);

  const setMaster = (value) => {
    setCookie('speechMaster', value ? '1' : '0');
    if (!value) stop();
    notify();
  };

  const isMaster = () => masterEnabled();

  const isSpeaking = () => speaking;

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  // 初回アクセス時に接続を確立 (announce 待ち受け)
  connect();

  return {
    speak,
    stop,
    setEnabled,
    isEnabled,
    setMaster,
    isMaster,
    isSpeaking,
    subscribe,
  };
}

export const speech = createManager();
export default speech;
