type PeriodType = "daily" | "weekly" | "monthly";

type SiteUsage = {
  host: string;
  ms: number;
  ratio: number;
  color: string;
};

type PeriodConfig = {
  type: PeriodType;
  label: string;
};

const PERIODS: PeriodConfig[] = [
  { type: "daily", label: "毎日" },
  { type: "weekly", label: "毎週" },
  { type: "monthly", label: "毎月" },
];

const periodButtonsEl = document.getElementById(
  "period-buttons",
) as HTMLDivElement;
const periodLabelEl = document.getElementById(
  "period-label",
) as HTMLParagraphElement;
const totalTimeEl = document.getElementById(
  "total-time",
) as HTMLParagraphElement;
const barChartEl = document.getElementById("bar-chart") as HTMLDivElement;
const pieChartEl = document.getElementById("pie-chart") as HTMLDivElement;
const legendEl = document.getElementById("legend") as HTMLUListElement;
const emptyEl = document.getElementById("empty") as HTMLDivElement;

let selectedPeriod: PeriodType = "daily";

void init();

async function init() {
  renderPeriodButtons();
  await renderCharts();
}

function renderPeriodButtons() {
  periodButtonsEl.innerHTML = "";

  for (const period of PERIODS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = period.label;
    button.dataset.period = period.type;
    button.className = period.type === selectedPeriod ? "is-active" : "";
    button.addEventListener("click", () => {
      selectedPeriod = period.type;
      renderPeriodButtons();
      void renderCharts();
    });
    periodButtonsEl.append(button);
  }
}

async function renderCharts() {
  const all = await chrome.storage.local.get(null);
  const periodRange = getPeriodRange(selectedPeriod, new Date());
  const siteUsageMap = aggregateUsageForRange(
    all,
    periodRange.startDateKey,
    periodRange.endDateKey,
  );
  const slices = makeSlicesWithOther(siteUsageMap);
  const totalMs = slices.reduce((sum, slice) => sum + slice.ms, 0);

  periodLabelEl.textContent = periodRange.label;
  totalTimeEl.textContent = `合計: ${formatDuration(totalMs)}`;

  if (slices.length === 0 || totalMs === 0) {
    emptyEl.hidden = false;
    barChartEl.innerHTML = "";
    pieChartEl.style.background = "";
    legendEl.innerHTML = "";
    return;
  }

  emptyEl.hidden = true;
  renderBarChart(slices, totalMs);
  renderPieChart(slices);
  renderLegend(slices);
}

function aggregateUsageForRange(
  storage: Record<string, unknown>,
  startDateKey: string,
  endDateKey: string,
) {
  const usage = new Map<string, number>();

  for (const [key, value] of Object.entries(storage)) {
    const match = /^usage:(\d{4}-\d{2}-\d{2}):(.+)$/.exec(key);
    if (!match) {
      continue;
    }

    const [, dateKey, host] = match;
    if (dateKey < startDateKey || dateKey > endDateKey) {
      continue;
    }

    const ms = Number(value ?? 0);
    if (!Number.isFinite(ms) || ms <= 0) {
      continue;
    }

    usage.set(host, (usage.get(host) ?? 0) + ms);
  }

  return usage;
}

function makeSlicesWithOther(usageMap: Map<string, number>) {
  const entries = [...usageMap.entries()]
    .map(([host, ms]) => ({ host, ms }))
    .sort((a, b) => b.ms - a.ms);

  const totalMs = entries.reduce((sum, entry) => sum + entry.ms, 0);
  if (totalMs === 0) {
    return [] as SiteUsage[];
  }

  const threshold = totalMs * 0.05;
  const slices: SiteUsage[] = [];
  let otherMs = 0;

  for (const [index, entry] of entries.entries()) {
    if (entry.ms >= threshold) {
      slices.push({
        host: entry.host,
        ms: entry.ms,
        ratio: entry.ms / totalMs,
        color: chartColor(index),
      });
      continue;
    }

    otherMs += entry.ms;
  }

  if (otherMs > 0) {
    slices.push({
      host: "その他",
      ms: otherMs,
      ratio: otherMs / totalMs,
      color: "#7380b8",
    });
  }

  return slices;
}

function renderBarChart(slices: SiteUsage[], totalMs: number) {
  barChartEl.innerHTML = "";

  for (const slice of slices) {
    const row = document.createElement("div");
    row.className = "bar-row";

    const header = document.createElement("div");
    header.className = "bar-header";

    const host = document.createElement("span");
    host.className = "bar-host";
    host.textContent = slice.host;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${Math.round(slice.ratio * 1000) / 10}% (${formatDuration(slice.ms)})`;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(slice.ms / totalMs) * 100}%`;
    fill.style.backgroundColor = slice.color;

    header.append(host, value);
    track.append(fill);
    row.append(header, track);
    barChartEl.append(row);
  }
}

function renderPieChart(slices: SiteUsage[]) {
  let start = 0;
  const gradients: string[] = [];

  for (const slice of slices) {
    const end = start + slice.ratio * 100;
    gradients.push(`${slice.color} ${start}% ${end}%`);
    start = end;
  }

  pieChartEl.style.background = `conic-gradient(${gradients.join(", ")})`;
}

function renderLegend(slices: SiteUsage[]) {
  legendEl.innerHTML = "";

  for (const slice of slices) {
    const item = document.createElement("li");

    const color = document.createElement("span");
    color.className = "legend-color";
    color.style.backgroundColor = slice.color;

    const text = document.createElement("span");
    text.className = "legend-text";
    text.textContent = `${slice.host} (${Math.round(slice.ratio * 1000) / 10}%)`;

    item.append(color, text);
    legendEl.append(item);
  }
}

function getPeriodRange(type: PeriodType, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (type === "daily") {
    const dateKey = dateToKey(today);
    return {
      label: `${dateKey} の統計`,
      startDateKey: dateKey,
      endDateKey: dateKey,
    };
  }

  if (type === "weekly") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return {
      label: `${dateToKey(start)} 〜 ${dateToKey(today)} の統計`,
      startDateKey: dateToKey(start),
      endDateKey: dateToKey(today),
    };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    label: `${today.getFullYear()}年${today.getMonth() + 1}月の統計`,
    startDateKey: dateToKey(start),
    endDateKey: dateToKey(today),
  };
}

function dateToKey(date: Date) {
  return date.toLocaleDateString("sv-SE");
}

function chartColor(index: number) {
  const palette = [
    "#8ea0ff",
    "#63c7ff",
    "#7de2a5",
    "#ffd273",
    "#ff96c2",
    "#c0a1ff",
    "#ffb980",
    "#8bf0ea",
  ];

  return palette[index % palette.length];
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
