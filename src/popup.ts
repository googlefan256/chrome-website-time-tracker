const rankingEl = document.getElementById("ranking") as HTMLOListElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;
const dateEl = document.getElementById("date") as HTMLParagraphElement;

void render();

async function render() {
  const dateKey = new Date().toLocaleDateString("sv-SE");
  dateEl.textContent = `${dateKey} の集計`;

  const all = await chrome.storage.local.get(null);
  const prefix = `usage:${dateKey}:`;

  const rows = Object.entries(all)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({
      host: key.slice(prefix.length),
      ms: Number(value ?? 0),
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 20);

  rankingEl.innerHTML = "";

  if (rows.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  await Promise.all(
    rows.map(async (row, index) => {
      const li = document.createElement("li");
      const fallbackColor = rankFallbackColor(index);
      li.style.setProperty("--site-primary", fallbackColor);
      li.innerHTML = `
        <span class="rank">${index + 1}</span>
        <div class="site">
          <img class="favicon" alt="" loading="lazy" />
          <span class="host">${row.host}</span>
        </div>
        <span class="time">${formatDuration(row.ms)}</span>
      `;

      const faviconEl = li.querySelector(".favicon") as HTMLImageElement;
      const faviconUrl = getFaviconServiceUrl(row.host);
      faviconEl.src = faviconUrl;

      const faviconColor = await readFaviconColor(faviconUrl);
      if (faviconColor) {
        li.style.setProperty("--site-primary", faviconColor);
      }

      rankingEl.append(li);
    }),
  );
}

function getFaviconServiceUrl(host: string) {
  const pageUrl = `https://${host}`;
  return `chrome://favicon2/?size=64&scale_factor=2x&page_url=${encodeURIComponent(pageUrl)}`;
}

async function readFaviconColor(iconUrl: string) {
  const img = new Image();
  img.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("favicon load failed"));
      img.src = iconUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, 24, 24);
    const { data } = ctx.getImageData(0, 0, 24, 24);

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 24) continue;

      const brightness = data[i] + data[i + 1] + data[i + 2];
      if (brightness < 36 || brightness > 720) continue;

      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }

    if (count === 0) return null;

    return rgbToHex(
      Math.round(r / count),
      Math.round(g / count),
      Math.round(b / count),
    );
  } catch {
    return null;
  }
}

function rankFallbackColor(index: number) {
  const palette = [
    "#8ea0ff",
    "#8ad0ff",
    "#8fffb1",
    "#ffd88a",
    "#ff9fc5",
    "#c8a2ff",
  ];

  return palette[index % palette.length];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
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
