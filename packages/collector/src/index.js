import process from "node:process";
import { loadEnv, writeRankingSnapshot } from "../../shared/src/index.js";
import { fetchByDiscoveredApi } from "./direct-fetch.js";
import { fetchByPlaywright } from "./playwright-fetch.js";

await loadEnv();

const targetUrl = process.env.TARGET_URL ?? "https://df.qq.com/cp/a20260611dfs/index.html";
const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 300000);
const once = process.argv.includes("--once");
const headless = process.env.HEADLESS !== "false";

async function collectOnce() {
  const capturedAt = new Date().toISOString();
  let records;

  try {
    records = await fetchByDiscoveredApi(targetUrl, capturedAt);
    console.log(`[collector] ${capturedAt} fetched ${records.length} records via discovered API`);
  } catch (apiError) {
    console.warn(`[collector] API discovery failed: ${apiError.message}`);
    records = await fetchByPlaywright(targetUrl, capturedAt, { headless });
    console.log(`[collector] ${capturedAt} fetched ${records.length} records via Playwright`);
  }

  await writeRankingSnapshot(records);
  console.log(`[collector] wrote ${records.length} records`);
}

async function loop() {
  while (true) {
    try {
      await collectOnce();
    } catch (error) {
      console.error(`[collector] failed: ${error.stack ?? error.message}`);
      if (once) process.exitCode = 1;
    }

    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

await loop();
