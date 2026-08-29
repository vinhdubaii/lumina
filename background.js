// Lumina — background service worker
// Tracks time spent on tracked domains (only while the tab is active AND the
// browser window is focused AND the user isn't idle), checkpoints usage to
// storage, and blocks a domain once its daily budget is spent.

const TICK_ALARM = "lumina-tick";
const TICK_MINUTES = 1; // checkpoint + enforcement granularity
const IDLE_THRESHOLD_SECONDS = 15;

// ---------- small storage helpers ----------

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDomain(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function getAll() {
  const data = await chrome.storage.local.get(["sites", "usage", "state"]);
  return {
    sites: data.sites || {},
    usage: data.usage || {},
    state: data.state || { domain: null, since: null },
  };
}

async function setState(state) {
  await chrome.storage.local.set({ state });
}

async function addUsage(domain, seconds) {
  if (seconds <= 0) return;
  const { usage } = await getAll();
  const key = todayKey();
  if (!usage[key]) usage[key] = {};
  usage[key][domain] = (usage[key][domain] || 0) + seconds;
  await chrome.storage.local.set({ usage });
  return usage[key][domain];
}

async function isOverLimit(domain) {
  const { sites, usage } = await getAll();
  const site = sites[domain];
  if (!site) return false;
  const used = (usage[todayKey()] || {})[domain] || 0;
  return used >= site.limitMinutes * 60;
}

// ---------- checkpointing ----------

// Flush whatever time has accrued since `state.since` for `state.domain`
// into today's usage, then optionally start a new tracking window.
async function checkpoint({ restart = false } = {}) {
  const { sites, state } = await getAll();
  const now = Date.now();

  if (state.domain && state.since && sites[state.domain]) {
    const elapsed = Math.round((now - state.since) / 1000);
    await addUsage(state.domain, elapsed);
  }

  if (restart && state.domain && sites[state.domain]) {
    await setState({ domain: state.domain, since: now });
  } else if (!restart) {
    await setState({ domain: state.domain, since: null });
  }
}

// ---------- figuring out "what's active right now" ----------

async function computeActiveDomain() {
  const win = await chrome.windows.getLastFocused({ populate: false });
  if (!win || !win.focused) return null;

  const idleState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  if (idleState !== "active") return null;

  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab || !tab.url) return null;

  return getDomain(tab.url);
}

async function refreshActive() {
  const { sites, state } = await getAll();
  const domain = await computeActiveDomain();
  const trackable = domain && sites[domain] ? domain : null;

  if (state.domain !== trackable) {
    // stop tracking whatever we were tracking, start tracking the new one
    await checkpoint({ restart: false });
    await setState({ domain: trackable, since: trackable ? Date.now() : null });
  }

  if (trackable && (await isOverLimit(trackable))) {
    await enforceBlock(trackable);
  }
}

// ---------- enforcement ----------

async function enforceBlock(domain) {
  const blockedUrl = chrome.runtime.getURL(
    `blocked/blocked.html?site=${encodeURIComponent(domain)}`
  );
  const tabs = await chrome.tabs.query({
    url: [`*://${domain}/*`, `*://*.${domain}/*`],
  });
  for (const tab of tabs) {
    if (tab.url && tab.url.startsWith(chrome.runtime.getURL(""))) continue;
    chrome.tabs.update(tab.id, { url: blockedUrl });
  }
  // stop the clock on this domain now that it's blocked
  const { state } = await getAll();
  if (state.domain === domain) {
    await setState({ domain: null, since: null });
  }
}

// pre-empt navigation to an already-blocked domain (avoids a flash of content)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const domain = getDomain(details.url);
  if (!domain) return;
  if (await isOverLimit(domain)) {
    const blockedUrl = chrome.runtime.getURL(
      `blocked/blocked.html?site=${encodeURIComponent(domain)}`
    );
    chrome.tabs.update(details.tabId, { url: blockedUrl });
  }
});

// ---------- event wiring ----------

chrome.tabs.onActivated.addListener(() => refreshActive());
chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) refreshActive();
});
chrome.windows.onFocusChanged.addListener(() => refreshActive());

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === "active") {
    await refreshActive();
  } else {
    await checkpoint({ restart: false });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    checkpoint({ restart: true }).then(() => refreshActive());
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  refreshActive();
});

// ---------- messaging API for popup / dashboard ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    // flush pending time so callers always see fresh numbers
    await checkpoint({ restart: true });
    const { sites, usage } = await getAll();

    switch (msg.type) {
      case "GET_SNAPSHOT": {
        sendResponse({ sites, todayKey: todayKey(), usage });
        break;
      }
      case "ADD_SITE": {
        const domain = getDomain(
          msg.domain.includes("://") ? msg.domain : `https://${msg.domain}`
        ) || msg.domain.replace(/^www\./, "").trim().toLowerCase();
        sites[domain] = { limitMinutes: msg.limitMinutes, addedAt: Date.now() };
        await chrome.storage.local.set({ sites });
        sendResponse({ ok: true, domain });
        break;
      }
      case "UPDATE_SITE": {
        if (sites[msg.domain]) {
          sites[msg.domain].limitMinutes = msg.limitMinutes;
          await chrome.storage.local.set({ sites });
        }
        sendResponse({ ok: true });
        break;
      }
      case "REMOVE_SITE": {
        delete sites[msg.domain];
        await chrome.storage.local.set({ sites });
        await refreshActive();
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message type" });
    }
  })();
  return true; // keep the message channel open for the async response
});
