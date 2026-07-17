export const rankingFields = [
  "capturedAt",
  "source",
  "rankingType",
  "stage",
  "platformFilter",
  "playerId",
  "rank",
  "platformName",
  "userName",
  "warehouseValue",
  "defeatedAgents",
  "decryptedBricks",
  "totalRounds",
];

export function makePlayerId(record) {
  const explicitId = record.playerId ?? record.userId ?? record.uid ?? record.openId;
  if (explicitId) return String(explicitId);
  return `${record.platformName ?? record.platName ?? "-"}::${record.userName ?? record.name ?? "unknown"}`;
}

export function normalizeRankingRecord(record, context = {}) {
  const rankingType = context.rankingType ?? record.rankingType ?? "score";
  const platformName = String(record.platformName ?? record.platName ?? record.platform ?? "-");
  const userName = String(record.userName ?? record.name ?? record.nickName ?? "未知选手");

  return {
    capturedAt: context.capturedAt,
    source: context.source ?? "unknown",
    rankingType,
    stage: String(context.stage ?? record.stage ?? record.stageName ?? "default"),
    platformFilter: String(context.platformFilter ?? record.platformFilter ?? "all"),
    playerId: makePlayerId({ ...record, platformName, userName }),
    rank: Number(record.rank ?? record.rankwid ?? record.rankdid ?? 0),
    platformName,
    userName,
    warehouseValue: Number(record.warehouseValue ?? record.score ?? record.value ?? 0),
    defeatedAgents: Number(record.defeatedAgents ?? record.killCount ?? record.kills ?? 0),
    decryptedBricks: Number(record.decryptedBricks ?? record.bricks ?? 0),
    totalRounds: Number(record.totalRounds ?? record.rounds ?? 0),
  };
}

export function validateWatchlist(ids) {
  if (!Array.isArray(ids)) {
    throw new Error("watchlist must be an array");
  }
  const unique = [...new Set(ids.map((id) => String(id)).filter(Boolean))];
  if (unique.length > 5) {
    throw new Error("watchlist can contain at most 5 players");
  }
  return unique;
}

