const HEARTBEAT_STALE_MS = 3_000;

type HeartbeatRequest = {
  type: "heartbeat";
  host: string;
  active: boolean;
  now: number;
};

type GetUsageRequest = {
  type: "getSiteUsage";
  host: string;
};

type RequestMessage = HeartbeatRequest | GetUsageRequest;

type TabState = {
  site: string;
  active: boolean;
  lastSeenAt: number;
};

const tabStates = new Map<number, TabState>();
const siteLastCountedAt = new Map<string, number>();

chrome.runtime.onMessage.addListener((message: RequestMessage, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "heartbeat") {
    void handleHeartbeat(message, sender).then(sendResponse);
    return true;
  }

  if (message.type === "getSiteUsage") {
    void getSiteUsage(message.host).then((usage) => {
      sendResponse({
        site: normalizeSiteHost(message.host),
        totalMs: usage
      });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

async function handleHeartbeat(message: HeartbeatRequest, sender: chrome.runtime.MessageSender) {
  const tabId = sender.tab?.id;
  const now = message.now;
  const site = normalizeSiteHost(message.host);

  if (typeof tabId === "number") {
    tabStates.set(tabId, {
      site,
      active: message.active,
      lastSeenAt: now
    });
  }

  await updateSiteUsage(site, now);

  return {
    site,
    totalMs: await getSiteUsage(site)
  };
}

async function updateSiteUsage(site: string, now: number) {
  cleanupStaleTabStates(now);

  if (!isSiteActive(site, now)) {
    siteLastCountedAt.delete(site);
    return;
  }

  const previous = siteLastCountedAt.get(site) ?? now;
  const delta = Math.max(0, now - previous);
  siteLastCountedAt.set(site, now);

  if (delta === 0) {
    return;
  }

  const dateKey = getDateKey(now);
  const key = storageKey(dateKey, site);
  const stored = await chrome.storage.local.get(key);
  const current = Number(stored[key] ?? 0);
  await chrome.storage.local.set({ [key]: current + delta });
}

function cleanupStaleTabStates(now: number) {
  for (const [tabId, tabState] of tabStates) {
    if (now - tabState.lastSeenAt > HEARTBEAT_STALE_MS) {
      tabStates.delete(tabId);
    }
  }
}

function isSiteActive(site: string, now: number) {
  for (const tabState of tabStates.values()) {
    if (tabState.site !== site) {
      continue;
    }

    if (!tabState.active) {
      continue;
    }

    if (now - tabState.lastSeenAt <= HEARTBEAT_STALE_MS) {
      return true;
    }
  }

  return false;
}

async function getSiteUsage(host: string) {
  const dateKey = getDateKey(Date.now());
  const site = normalizeSiteHost(host);
  const key = storageKey(dateKey, site);
  const data = await chrome.storage.local.get(key);
  return Number(data[key] ?? 0);
}

function getDateKey(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("sv-SE");
}

function storageKey(dateKey: string, host: string) {
  return `usage:${dateKey}:${host}`;
}

function normalizeSiteHost(host: string) {
  const cleaned = host.toLowerCase().trim().replace(/\.$/, "");
  if (!cleaned) {
    return host;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(cleaned) || cleaned.includes(":")) {
    return cleaned;
  }

  const labels = cleaned.split(".");
  if (labels.length <= 2) {
    return cleaned;
  }

  const secondLevelTlds = new Set([
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "co.jp",
    "ne.jp",
    "or.jp",
    "com.au",
    "net.au",
    "org.au",
    "co.kr",
    "com.br"
  ]);

  const tail2 = labels.slice(-2).join(".");
  const tail3 = labels.slice(-3).join(".");

  if (secondLevelTlds.has(tail2) && labels.length >= 3) {
    return tail3;
  }

  return tail2;
}
