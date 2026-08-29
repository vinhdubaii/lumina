const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

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

function barColor(fraction) {
  const gold = [255, 184, 77];
  const ember = [255, 107, 91];
  const t = Math.min(1, fraction);
  const rgb = gold.map((c, i) => Math.round(c + (ember[i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

async function main() {
  const { sites, usage } = await chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" });
  const domains = Object.keys(sites);
  const content = document.getElementById("content");
  const emptyEl = document.getElementById("empty-state");
  const template = document.getElementById("site-chart-template");

  if (domains.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  const days = lastNDays(7);

  domains
    .sort((a, b) => a.localeCompare(b))
    .forEach((domain) => {
      const { limitMinutes } = sites[domain];
      const limitSeconds = limitMinutes * 60;

      const node = template.content.cloneNode(true);
      node.querySelector(".site-chart-name").textContent = domain;
      node.querySelector(".site-chart-limit").textContent = `Giới hạn ${limitMinutes} phút/ngày`;

      const barsEl = node.querySelector(".bars");
      days.forEach((d) => {
        const key = toKey(d);
        const usedSeconds = (usage[key] || {})[domain] || 0;
        const fraction = limitSeconds > 0 ? usedSeconds / limitSeconds : 0;
        const heightPct = Math.max(2, Math.min(100, fraction * 100));
        const isToday = key === toKey(new Date());

        const col = document.createElement("div");
        col.className = "bar-col" + (isToday ? " is-today" : "");

        const track = document.createElement("div");
        track.className = "bar-track";

        const fill = document.createElement("div");
        fill.className = "bar-fill";
        fill.style.height = `${heightPct}%`;
        fill.style.background = barColor(fraction);
        fill.title = `${Math.round(usedSeconds / 60)} phút`;

        track.appendChild(fill);

        const label = document.createElement("div");
        label.className = "bar-label";
        label.textContent = WEEKDAY_LABELS[d.getDay()];

        col.appendChild(track);
        col.appendChild(label);
        barsEl.appendChild(col);
      });

      content.appendChild(node);
    });
}

main();
