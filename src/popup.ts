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

  rows.forEach((row, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="host">${row.host}</span>
      <span class="time">${formatDuration(row.ms)}</span>
    `;
    rankingEl.append(li);
  });
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
