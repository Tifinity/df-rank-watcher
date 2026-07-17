import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWatchlistStats,
  getDataPaths,
  listPlayers,
  readLatestRankings,
  readWatchlist,
  validateWatchlist,
  writeRankingSnapshot,
  writeWatchlist,
} from "../packages/shared/src/index.js";

test("watchlist rejects more than 5 players", () => {
  assert.throws(() => validateWatchlist(["1", "2", "3", "4", "5", "6"]), /at most 5/);
});

test("ranking snapshot writes latest csv, history csv, and jsonl", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "df-rank-watcher-"));
  const paths = getDataPaths(dir);
  try {
    await writeRankingSnapshot(
      [
        {
          capturedAt: "2026-07-17T00:00:00.000Z",
          source: "test",
          rankingType: "score",
          stage: "default",
          platformFilter: "all",
          playerId: "B站::测试选手",
          rank: 1,
          platformName: "B站",
          userName: "测试选手",
          warehouseValue: 123456,
          defeatedAgents: 7,
          decryptedBricks: 2,
          totalRounds: 3,
        },
      ],
      paths,
    );

    const latest = await readLatestRankings(paths);
    assert.equal(latest.length, 1);
    assert.equal(latest[0].userName, "测试选手");
    assert.equal(latest[0].warehouseValue, "123456");

    const snapshots = await readFile(paths.snapshots, "utf8");
    assert.match(snapshots, /测试选手/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("watchlist persistence and stats aggregation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "df-rank-watcher-"));
  const paths = getDataPaths(dir);
  try {
    await writeWatchlist(["p1", "p2"], paths);
    assert.deepEqual(await readWatchlist(paths), ["p1", "p2"]);

    const latest = [
      { playerId: "p1", userName: "A", platformName: "B站", capturedAt: "2", warehouseValue: "20" },
      { playerId: "p2", userName: "B", platformName: "虎牙", capturedAt: "2", warehouseValue: "10" },
    ];
    const history = [
      { playerId: "p1", capturedAt: "1", warehouseValue: "10" },
      { playerId: "p1", capturedAt: "2", warehouseValue: "20" },
    ];

    assert.equal(listPlayers(latest).length, 2);
    const stats = buildWatchlistStats(["p1"], latest, history);
    assert.equal(stats[0].latest.userName, "A");
    assert.equal(stats[0].history.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
