const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const listEl = document.getElementById("site-list");
const emptyEl = document.getElementById("empty-state");
const rowTemplate = document.getElementById("site-row-template");
const form = document.getElementById("add-form");
const domainInput = document.getElementById("domain-input");
const minutesInput = document.getElementById("minutes-input");

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function dialColor(fraction) {
  const gold = [255, 184, 77];
  const ember = [255, 107, 91];
  const t = Math.min(1, fraction);
  const rgb = gold.map((c, i) => Math.round(c + (ember[i] - c) * t));
  return `rgb(${rgb.join(",")})`;
}

async function render() {
  const { sites, usage, todayKey } = await send({ type: "GET_SNAPSHOT" });
  const todayUsage = usage[todayKey] || {};
  const domains = Object.keys(sites);

  listEl.innerHTML = "";
  emptyEl.hidden = domains.length > 0;
  listEl.hidden = domains.length === 0;

  domains
    .sort((a, b) => a.localeCompare(b))
    .forEach((domain) => {
      const { limitMinutes } = sites[domain];
      const usedSeconds = todayUsage[domain] || 0;
      const limitSeconds = limitMinutes * 60;
      const fraction = Math.min(1, usedSeconds / limitSeconds);

      const node = rowTemplate.content.cloneNode(true);
      const progress = node.querySelector(".dial-progress");
      progress.style.strokeDasharray = `${CIRCUMFERENCE}`;
      progress.style.strokeDashoffset = `${CIRCUMFERENCE * fraction}`;
      progress.style.stroke = dialColor(fraction);

      node.querySelector(".site-name").textContent = domain;
      node.querySelector(".site-time").textContent =
        fraction >= 1
          ? "Hết giờ hôm nay"
          : `${formatTime(usedSeconds)} / ${limitMinutes}:00`;

      const limitInput = node.querySelector(".limit-input");
      limitInput.value = limitMinutes;
      limitInput.addEventListener("change", async () => {
        const next = parseInt(limitInput.value, 10);
        if (!next || next <= 0) {
          limitInput.value = limitMinutes;
          return;
        }
        await send({ type: "UPDATE_SITE", domain, limitMinutes: next });
        render();
      });

      node.querySelector(".delete-btn").addEventListener("click", async () => {
        await send({ type: "REMOVE_SITE", domain });
        render();
      });

      listEl.appendChild(node);
    });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = domainInput.value.trim().toLowerCase();
  const limitMinutes = parseInt(minutesInput.value, 10);
  if (!domain || !limitMinutes || limitMinutes <= 0) return;

  await send({ type: "ADD_SITE", domain, limitMinutes });
  domainInput.value = "";
  minutesInput.value = "30";
  render();
});

render();
