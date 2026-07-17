import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getDataPaths } from "./config.js";
import { rankingFields, validateWatchlist } from "./schema.js";

export function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function csvLine(record) {
  return rankingFields.map((field) => csvEscape(record[field])).join(",");
}

export function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((field, index) => [field, values[index] ?? ""]));
  });
}

export async function ensureOutputDir(paths = getDataPaths()) {
  await mkdir(paths.outputDir, { recursive: true });
}

export async function writeRankingSnapshot(records, paths = getDataPaths()) {
  await ensureOutputDir(paths);
  const header = `${rankingFields.join(",")}\n`;
  const csv = `${header}${records.map(csvLine).join("\n")}${records.length ? "\n" : ""}`;
  const tmpLatest = `${paths.latestCsv}.tmp`;

  await appendFile(paths.snapshots, `${JSON.stringify({ capturedAt: records[0]?.capturedAt ?? new Date().toISOString(), records })}\n`);

  if (!existsSync(paths.historyCsv)) {
    await writeFile(paths.historyCsv, header);
  }
  if (records.length) {
    await appendFile(paths.historyCsv, `${records.map(csvLine).join("\n")}\n`);
  }

  await writeFile(tmpLatest, csv);
  await rename(tmpLatest, paths.latestCsv);
}

export async function readLatestRankings(paths = getDataPaths()) {
  if (!existsSync(paths.latestCsv)) return [];
  return parseCsv(await readFile(paths.latestCsv, "utf8"));
}

export async function readHistoryRankings(paths = getDataPaths()) {
  if (!existsSync(paths.historyCsv)) return [];
  return parseCsv(await readFile(paths.historyCsv, "utf8"));
}

export async function readWatchlist(paths = getDataPaths()) {
  if (!existsSync(paths.watchlist)) return [];
  const parsed = JSON.parse(await readFile(paths.watchlist, "utf8"));
  return validateWatchlist(parsed.playerIds ?? parsed);
}

export async function writeWatchlist(playerIds, paths = getDataPaths()) {
  await ensureOutputDir(paths);
  const ids = validateWatchlist(playerIds);
  const tmp = `${paths.watchlist}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ playerIds: ids }, null, 2)}\n`);
  await rename(tmp, paths.watchlist);
  return ids;
}

export function listPlayers(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record.playerId) continue;
    byId.set(record.playerId, {
      playerId: record.playerId,
      userName: record.userName,
      platformName: record.platformName,
    });
  }
  return [...byId.values()].sort((a, b) => a.userName.localeCompare(b.userName, "zh-CN"));
}

export function buildWatchlistStats(watchlist, latestRecords, historyRecords) {
  const latestByPlayer = new Map();
  for (const record of latestRecords) {
    if (!watchlist.includes(record.playerId)) continue;
    const existing = latestByPlayer.get(record.playerId);
    if (!existing || String(record.capturedAt) > String(existing.capturedAt)) {
      latestByPlayer.set(record.playerId, record);
    }
  }

  const historyByPlayer = new Map(watchlist.map((id) => [id, []]));
  for (const record of historyRecords) {
    if (!historyByPlayer.has(record.playerId)) continue;
    historyByPlayer.get(record.playerId).push(record);
  }

  return watchlist.map((playerId) => ({
    playerId,
    latest: latestByPlayer.get(playerId) ?? null,
    history: historyByPlayer.get(playerId) ?? [],
  }));
}

