type UsageEntry = {
  dateKey: string;
  host: string;
  ms: number;
};

type Period = {
  id: string;
  title: string;
  subtitle: string;
  dateKeys: Set<string>;
};

type SiteSlice = {
  host: string;
  ms: number;
  ratio: number;
  color: string;
};

const DAILY_BAR_VISIBLE_RANK = 10;

const periodsEl = document.getElementById("periods") as HTMLDivElement;

void render();

async function render() {
  const now = new Date();
  const all = await chrome.storage.local.get(null);
  const entries = parseUsageEntries(all);
  const periods = buildPeriods(now);

  periodsEl.innerHTML = "";

  for (const period of periods) {
    const section = renderPeriod(period, entries);
    periodsEl.append(section);
  }
}

function parseUsageEntries(storage: Record<string, unknown>) {
  const entries: UsageEntry[] = [];

  for (const [key, value] of Object.entries(storage)) {
    if (!key.startsWith("usage:")) {
      continue;
    }

    const parts = key.split(":");
    if (parts.length < 3) {
      continue;
    }

    const dateKey = parts[1];
    const host = parts.slice(2).join(":");
    const ms = Number(value ?? 0);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      continue;
    }

    if (!Number.isFinite(ms) || ms <= 0) {
      continue;
    }

    entries.push({ dateKey, host, ms });
  }

  return entries;
}

function buildPeriods(now: Date): Period[] {
  const todayKey = toDateKey(now);

  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return [
    {
      id: "daily",
      title: "毎日の統計",
      subtitle: `${todayKey}`,
      dateKeys: collectDateKeys(todayKey, todayKey),
    },
    {
      id: "weekly",
      title: "毎週の統計",
      subtitle: `${toDateKey(weekStart)} 〜 ${todayKey}`,
      dateKeys: collectDateKeys(toDateKey(weekStart), todayKey),
    },
    {
      id: "monthly",
      title: "毎月の統計",
      subtitle: `${toDateKey(monthStart)} 〜 ${todayKey}`,
      dateKeys: collectDateKeys(toDateKey(monthStart), todayKey),
    },
  ];
}

function collectDateKeys(startKey: string, endKey: string) {
  const keys = new Set<string>();
  const cursor = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);

  while (cursor <= end) {
    keys.add(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function renderPeriod(period: Period, entries: UsageEntry[]) {
  const section = document.createElement("section");
  section.className = "period";

  const heading = document.createElement("h2");
  heading.textContent = period.title;

  const subtitle = document.createElement("p");
  subtitle.className = "period-subtitle";
  subtitle.textContent = period.subtitle;

  const targetEntries = entries.filter((entry) =>
    period.dateKeys.has(entry.dateKey),
  );
  const slices =
    period.id === "daily"
      ? summarizeTopRanks(targetEntries, DAILY_BAR_VISIBLE_RANK)
      : summarizeSlices(targetEntries);

  section.append(heading, subtitle);

  if (slices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "まだ計測データがありません。";
    section.append(empty);
    return section;
  }

  if (period.id === "daily") {
    section.append(
      renderBarChart(
        slices,
        `今日のドメイン別棒グラフ（${DAILY_BAR_VISIBLE_RANK}位まで + その他）`,
      ),
    );
    return section;
  }

  section.append(renderBarChart(slices), renderPieChart(slices));
  return section;
}

function summarizeTopRanks(entries: UsageEntry[], visibleRank: number) {
  const totalsByHost = new Map<string, number>();

  for (const entry of entries) {
    totalsByHost.set(
      entry.host,
      (totalsByHost.get(entry.host) ?? 0) + entry.ms,
    );
  }

  const sorted = [...totalsByHost.entries()]
    .map(([host, ms]) => ({ host, ms }))
    .sort((a, b) => b.ms - a.ms);

  const totalMs = sorted.reduce((sum, row) => sum + row.ms, 0);
  if (totalMs === 0) {
    return [] as SiteSlice[];
  }

  const visible = sorted.slice(0, visibleRank);
  const otherMs = sorted
    .slice(visibleRank)
    .reduce((sum, row) => sum + row.ms, 0);

  const merged = [...visible];
  if (otherMs > 0) {
    merged.push({ host: "その他", ms: otherMs });
  }

  return merged.map((row, index) => ({
    host: row.host,
    ms: row.ms,
    ratio: row.ms / totalMs,
    color: chartColor(index),
  }));
}

function summarizeSlices(entries: UsageEntry[]) {
  const totalsByHost = new Map<string, number>();

  for (const entry of entries) {
    totalsByHost.set(
      entry.host,
      (totalsByHost.get(entry.host) ?? 0) + entry.ms,
    );
  }

  const sorted = [...totalsByHost.entries()]
    .map(([host, ms]) => ({ host, ms }))
    .sort((a, b) => b.ms - a.ms);

  const totalMs = sorted.reduce((sum, row) => sum + row.ms, 0);
  if (totalMs === 0) {
    return [] as SiteSlice[];
  }

  const major: Array<{ host: string; ms: number }> = [];
  let otherMs = 0;

  for (const row of sorted) {
    const ratio = row.ms / totalMs;
    if (ratio >= 0.05) {
      major.push(row);
    } else {
      otherMs += row.ms;
    }
  }

  const merged = [...major];
  if (otherMs > 0) {
    merged.push({ host: "その他", ms: otherMs });
  }

  return merged.map((row, index) => ({
    host: row.host,
    ms: row.ms,
    ratio: row.ms / totalMs,
    color: chartColor(index),
  }));
}

function renderBarChart(slices: SiteSlice[], headingText = "棒グラフ") {
  const wrap = document.createElement("div");
  wrap.className = "chart-block";

  const title = document.createElement("h3");
  title.textContent = headingText;

  const list = document.createElement("ul");
  list.className = "bar-list";

  for (const slice of slices) {
    const item = document.createElement("li");
    item.className = "bar-item";

    const labelRow = document.createElement("div");
    labelRow.className = "bar-label-row";
    labelRow.innerHTML = `
      <span class="host">${slice.host}</span>
      <span class="meta">${Math.round(slice.ratio * 1000) / 10}% / ${formatDuration(slice.ms)}</span>
    `;

    const barTrack = document.createElement("div");
    barTrack.className = "bar-track";

    const barFill = document.createElement("div");
    barFill.className = "bar-fill";
    barFill.style.width = `${Math.max(slice.ratio * 100, 1)}%`;
    barFill.style.background = slice.color;

    barTrack.append(barFill);
    item.append(labelRow, barTrack);
    list.append(item);
  }

  wrap.append(title, list);
  return wrap;
}

function renderPieChart(slices: SiteSlice[]) {
  const wrap = document.createElement("div");
  wrap.className = "chart-block";

  const title = document.createElement("h3");
  title.textContent = "円グラフ";

  const graph = document.createElement("div");
  graph.className = "pie";

  let offset = 0;
  const segments = slices.map((slice) => {
    const start = offset;
    offset += slice.ratio * 100;
    return `${slice.color} ${start}% ${offset}%`;
  });

  graph.style.background = `conic-gradient(${segments.join(",")})`;

  const legend = document.createElement("ul");
  legend.className = "legend";

  for (const slice of slices) {
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="dot" style="background:${slice.color}"></span>
      <span class="legend-host">${slice.host}</span>
      <span class="legend-ratio">${Math.round(slice.ratio * 1000) / 10}%</span>
    `;
    legend.append(item);
  }

  wrap.append(title, graph, legend);
  return wrap;
}

function chartColor(index: number) {
  const palette = [
    "#7aa2ff",
    "#68d6ff",
    "#7effac",
    "#ffd36f",
    "#ffa0d7",
    "#bb9dff",
    "#ff9f7a",
    "#95ffeb",
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

function toDateKey(date: Date) {
  return date.toLocaleDateString("sv-SE");
}
