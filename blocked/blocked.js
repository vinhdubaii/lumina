const params = new URLSearchParams(location.search);
const site = params.get("site") || "trang này";
document.getElementById("site-name").textContent = site;

const QUOTES = [
  "Nghỉ mắt một chút, ngày mai ánh sáng lại đầy.",
  "Thời gian bạn không dùng ở đây, hãy dành cho điều gì đó thật.",
  "Giới hạn hôm nay là để bạn còn năng lượng cho ngày mai.",
  "Một khoảng lặng nhỏ cũng là một lựa chọn tốt.",
];
document.getElementById("quote").textContent =
  QUOTES[Math.floor(Math.random() * QUOTES.length)];

function tick() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = Math.max(0, midnight - now);

  const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
  document.getElementById("countdown").textContent = `${h}:${m}:${s}`;
}

tick();
setInterval(tick, 1000);
