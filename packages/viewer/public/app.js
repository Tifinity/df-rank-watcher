const state = {
  players: [],
  watchlist: [],
  stats: [],
  query: "",
};

const elements = {
  status: document.querySelector("#status"),
  refresh: document.querySelector("#refresh"),
  watchCount: document.querySelector("#watch-count"),
  watchGrid: document.querySelector("#watch-grid"),
  search: document.querySelector("#player-search"),
  playerList: document.querySelector("#player-list"),
};

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("zh-CN");
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload;
}

function drawSparkline(history) {
  const values = history.map((row) => Number(row.warehouseValue)).filter((value) => Number.isFinite(value));
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 58 - ((value - min) / range) * 52;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return `
    <svg class="sparkline" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="#0b6bcb" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
    </svg>
  `;
}

function renderWatchGrid() {
  elements.watchCount.textContent = `${state.watchlist.length}/5`;
  if (!state.watchlist.length) {
    elements.watchGrid.innerHTML = '<div class="empty">尚未关注选手，请在右侧配置。</div>';
    return;
  }

  elements.watchGrid.innerHTML = state.stats
    .map((item) => {
      const latest = item.latest;
      if (!latest) {
        const player = state.players.find((candidate) => candidate.playerId === item.playerId);
        return `
          <article class="card">
            <div class="player-title">
              <strong>${escapeHtml(player?.userName ?? item.playerId)}</strong>
              <span class="platform">${escapeHtml(player?.platformName ?? "-")}</span>
            </div>
            <p class="updated">暂无本地榜单数据</p>
          </article>
        `;
      }

      return `
        <article class="card">
          <div class="player-title">
            <strong title="${escapeHtml(latest.userName)}">${escapeHtml(latest.userName)}</strong>
            <span class="platform">${escapeHtml(latest.platformName)}</span>
          </div>
          <div class="metrics">
            <div class="metric"><span>排名</span><strong>${formatNumber(latest.rank)}</strong></div>
            <div class="metric"><span>仓库总价值</span><strong>${formatNumber(latest.warehouseValue)}</strong></div>
            <div class="metric"><span>击败干员数</span><strong>${formatNumber(latest.defeatedAgents)}</strong></div>
            <div class="metric"><span>破译砖次数</span><strong>${formatNumber(latest.decryptedBricks)}</strong></div>
            <div class="metric"><span>总局数</span><strong>${formatNumber(latest.totalRounds)}</strong></div>
            <div class="metric"><span>榜单</span><strong>${escapeHtml(latest.rankingType)}</strong></div>
          </div>
          ${drawSparkline(item.history)}
          <p class="updated">更新于 ${formatTime(latest.capturedAt)}</p>
        </article>
      `;
    })
    .join("");
}

function renderPlayerList() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.players
    .filter((player) => {
      if (!query) return true;
      return `${player.userName} ${player.platformName}`.toLowerCase().includes(query);
    })
    .slice(0, 200);

  if (!filtered.length) {
    elements.playerList.innerHTML = '<div class="empty">暂无可选选手。先运行 collector:once 获取数据。</div>';
    return;
  }

  elements.playerList.innerHTML = filtered
    .map((player) => {
      const selected = state.watchlist.includes(player.playerId);
      const disabled = !selected && state.watchlist.length >= 5;
      return `
        <div class="player-row">
          <div>
            <strong title="${escapeHtml(player.userName)}">${escapeHtml(player.userName)}</strong>
            <span>${escapeHtml(player.platformName)}</span>
          </div>
          <button data-player-id="${escapeHtml(player.playerId)}" class="${selected ? "remove" : ""}" ${disabled ? "disabled" : ""}>
            ${selected ? "移除" : "关注"}
          </button>
        </div>
      `;
    })
    .join("");
}

async function saveWatchlist(playerIds) {
  const result = await requestJson("/api/watchlist", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerIds }),
  });
  state.watchlist = result.playerIds;
  await loadStats();
  render();
}

async function loadStats() {
  const payload = await requestJson("/api/watchlist/stats");
  state.stats = payload.players;
}

function render() {
  renderWatchGrid();
  renderPlayerList();
}

async function loadAll() {
  elements.status.textContent = "读取本地数据中";
  const [players, watchlist] = await Promise.all([requestJson("/api/players"), requestJson("/api/watchlist")]);
  state.players = players.players;
  state.watchlist = watchlist.playerIds;
  await loadStats();
  elements.status.textContent = `已加载 ${state.players.length} 个选手`;
  render();
}

elements.refresh.addEventListener("click", () => {
  loadAll().catch((error) => {
    elements.status.textContent = error.message;
  });
});

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderPlayerList();
});

elements.playerList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-player-id]");
  if (!button) return;
  const playerId = button.dataset.playerId;
  const next = state.watchlist.includes(playerId)
    ? state.watchlist.filter((id) => id !== playerId)
    : [...state.watchlist, playerId];
  saveWatchlist(next).catch((error) => {
    elements.status.textContent = error.message;
  });
});

loadAll().catch((error) => {
  elements.status.textContent = error.message;
  render();
});
