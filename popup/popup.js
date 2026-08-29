const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const HISTORY_DAYS = 6;
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const mainEl = document.getElementById("main-content");

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  return days;
}

function dialColor(fraction) {
  const gold = [255, 184, 77];
  const ember = [255, 107, 91];
  const t = Math.min(1, fraction);
  const rgb = gold.map((c, i) => Math.round(c + (ember[i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

function getCurrentDomain() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) return resolve(null);
      try {
        const u = new URL(tab.url);
        if (!/^https?:$/.test(u.protocol)) return resolve(null);
        resolve(u.hostname.replace(/^www\./, ""));
      } catch {
        resolve(null);
      }
    });
  });
}

function renderHistory(container, domain, sites, usage) {
  const { limitMinutes } = sites[domain];
  const limitSeconds = limitMinutes * 60;
  const days = lastNDays(HISTORY_DAYS);
  const todayKey = toKey(new Date());

  days.forEach((d) => {
    const key = toKey(d);
    const usedSeconds = (usage[key] || {})[domain] || 0;
    const fraction = limitSeconds > 0 ? usedSeconds / limitSeconds : 0;
    const heightPct = Math.max(4, Math.min(100, fraction * 100));

    const col = document.createElement("div");
    col.className = "history-bar-col" + (key === todayKey ? " is-today" : "");

    const track = document.createElement("div");
    track.className = "history-bar-track";

    const fill = document.createElement("div");
    fill.className = "history-bar-fill";
    fill.style.height = `${heightPct}%`;
    fill.style.background = dialColor(fraction);
    fill.title = `${Math.round(usedSeconds / 60)} phút`;

    track.appendChild(fill);

    const label = document.createElement("div");
    label.className = "history-bar-label";
    label.textContent = WEEKDAY_LABELS[d.getDay()];

    col.appendChild(track);
    col.appendChild(label);
    container.appendChild(col);
  });
}

function renderTracked(domain, sites, usage, todayKey) {
  const template = document.getElementById("tracked-view-template");
  const node = template.content.cloneNode(true);

  const { limitMinutes } = sites[domain];
  const usedSeconds = (usage[todayKey] || {})[domain] || 0;
  const limitSeconds = limitMinutes * 60;
  const fraction = Math.min(1, usedSeconds / limitSeconds);
  const remainingMinutes = Math.max(0, Math.ceil((limitSeconds - usedSeconds) / 60));

  const progress = node.querySelector(".dial-progress");
  progress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  progress.style.strokeDashoffset = `${CIRCUMFERENCE * fraction}`;
  progress.style.stroke = dialColor(fraction);

  node.querySelector(".site-domain").textContent = domain;
  node.querySelector(".site-remaining").textContent =
    fraction >= 1 ? "Hết giờ hôm nay" : `${remainingMinutes} phút còn lại`;
  node.querySelector(".site-limit").textContent = `Giới hạn ${limitMinutes} phút / ngày`;

  renderHistory(node.querySelector(".history-bars"), domain, sites, usage);

  mainEl.innerHTML = "";
  mainEl.appendChild(node);
}

function renderUntracked(domain) {
  const template = document.getElementById("untracked-view-template");
  const node = template.content.cloneNode(true);
  node.querySelector(".untracked-domain").textContent = domain;

  mainEl.innerHTML = "";
  mainEl.appendChild(node);

  document.getElementById("quick-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const limitMinutes = parseInt(document.getElementById("quick-minutes").value, 10);
    if (!limitMinutes || limitMinutes <= 0) return;
    await send({ type: "ADD_SITE", domain, limitMinutes });
    render();
  });
}

function renderEmpty() {
  const template = document.getElementById("empty-view-template");
  mainEl.innerHTML = "";
  mainEl.appendChild(template.content.cloneNode(true));
}

async function render() {
  const domain = await getCurrentDomain();
  if (!domain) return renderEmpty();

  const { sites, usage, todayKey } = await send({ type: "GET_SNAPSHOT" });
  if (sites[domain]) {
    renderTracked(domain, sites, usage, todayKey);
  } else {
    renderUntracked(domain);
  }
}

document.getElementById("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
setInterval(render, 5000);
