const ROOT_ID = "website-time-tracker-root";
const TICK_MS = 1_000;
const TITLE = "Tube Timer";

if (location.protocol.startsWith("http")) {
  void boot();
}

async function boot() {
  const dateKey = getTodayKey();
  const hostKey = location.hostname;

  const ui = createWidget();
  const colors = await resolveSiteColors();
  applyColors(ui, colors);

  let totalMs = await getUsage(dateKey, hostKey);
  let lastTick = Date.now();

  const sync = async () => {
    await setUsage(dateKey, hostKey, totalMs);
  };

  const tick = () => {
    const now = Date.now();

    if (isActive()) {
      totalMs += now - lastTick;
    }

    lastTick = now;
    render(ui, totalMs);
  };

  render(ui, totalMs);
  setInterval(tick, TICK_MS);

  window.addEventListener("beforeunload", () => {
    void sync();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastTick = Date.now();
    }
    void sync();
  });

  window.addEventListener("blur", () => {
    void sync();
  });

  setInterval(() => {
    void sync();
  }, 10_000);
}

function createWidget() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.position = "fixed";
  root.style.top = "16px";
  root.style.right = "16px";
  root.style.zIndex = "2147483647";
  root.style.pointerEvents = "none";

  const shadow = root.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .wrap {
      min-width: 240px;
      max-width: 280px;
      padding: 14px 16px;
      border-radius: 14px;
      color: #fff;
      background: linear-gradient(145deg, rgba(38, 9, 50, 0.94), rgba(113, 16, 33, 0.9));
      box-shadow: 0 14px 30px rgba(0,0,0,0.28);
      border: 1px solid rgba(255,255,255,0.15);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    .name {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
      opacity: 0.95;
      letter-spacing: 0.02em;
    }
    .time {
      font-size: 52px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin-bottom: 8px;
    }
    .desc {
      font-size: 14px;
      font-weight: 700;
      opacity: 0.9;
      margin-bottom: 4px;
    }
    .note {
      font-size: 12px;
      opacity: 0.82;
      letter-spacing: 0.01em;
    }
  `;

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = TITLE;

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = "00:00:00";

  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = `今日 ${location.hostname} で使った時間`;

  const note = document.createElement("div");
  note.className = "note";
  note.textContent = "この時間はもう戻りません";

  wrap.append(name, time, desc, note);
  shadow.append(style, wrap);

  document.documentElement.append(root);

  return { wrap, time };
}

function render(ui: { time: HTMLDivElement }, totalMs: number) {
  ui.time.textContent = formatDuration(totalMs);
}

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");

  return `${h}:${m}:${s}`;
}

function isActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function getTodayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

async function getUsage(dateKey: string, host: string) {
  const key = storageKey(dateKey, host);
  const data = await chrome.storage.local.get(key);
  return Number(data[key] ?? 0);
}

async function setUsage(dateKey: string, host: string, value: number) {
  const key = storageKey(dateKey, host);
  await chrome.storage.local.set({ [key]: Math.floor(value) });
}

function storageKey(dateKey: string, host: string) {
  return `usage:${dateKey}:${host}`;
}

async function resolveSiteColors() {
  const themeColor = readMetaThemeColor();
  const pageColor = readBodyColor();
  const faviconColor = await readFaviconColor();

  const primary = faviconColor ?? themeColor ?? "#74162f";
  const secondary = pageColor ?? "#2e0f43";

  return { primary, secondary };
}

function applyColors(ui: { wrap: HTMLDivElement }, colors: { primary: string; secondary: string }) {
  ui.wrap.style.background = `linear-gradient(145deg, ${withAlpha(colors.secondary, 0.94)}, ${withAlpha(colors.primary, 0.9)})`;
}

function readMetaThemeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  return meta?.content?.trim() || null;
}

function readBodyColor() {
  const bg = getComputedStyle(document.body).backgroundColor;
  if (!bg || bg === "rgba(0, 0, 0, 0)") {
    return null;
  }
  const rgb = bg.match(/\d+/g);
  if (!rgb || rgb.length < 3) {
    return null;
  }
  return rgbToHex(Number(rgb[0]), Number(rgb[1]), Number(rgb[2]));
}

async function readFaviconColor() {
  const faviconUrl = getFaviconUrl();
  if (!faviconUrl) return null;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("favicon load failed"));
      img.src = faviconUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 24) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }

    if (count === 0) return null;

    return rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
  } catch {
    return null;
  }
}

function getFaviconUrl() {
  const icon = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="apple-touch-icon"]'
  );

  if (!icon?.href) return null;

  try {
    return new URL(icon.href, location.href).toString();
  } catch {
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number) {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function withAlpha(hex: string, alpha: number) {
  const parsed = hexToRgb(hex);
  if (!parsed) return hex;
  const { r, g, b } = parsed;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(alpha, 1))})`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  };
}
