import { normalizeRankingRecord } from "../../shared/src/index.js";

function parseNumber(text) {
  const raw = String(text ?? "").trim();
  const normalized = raw.replace(/[^\d.-]/g, "");
  const value = Number(normalized || 0);
  if (/M/i.test(raw)) return Math.round(value * 1000000);
  if (/K/i.test(raw)) return Math.round(value * 1000);
  return value;
}

function linesFromText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sliceAfterSequence(lines, sequence) {
  for (let index = 0; index <= lines.length - sequence.length; index += 1) {
    const matched = sequence.every((value, offset) => lines[index + offset] === value);
    if (matched) return lines.slice(index + sequence.length);
  }
  return [];
}

function trimAtPagination(lines) {
  const endIndex = lines.findIndex((line) => line === "首页" || line === "暂无数据~" || line === "榜单更新稍有延迟，请耐心等待");
  return endIndex >= 0 ? lines.slice(0, endIndex) : lines;
}

function parseScoreRanking(text, capturedAt) {
  const dataLines = trimAtPagination(
    sliceAfterSequence(linesFromText(text), ["本阶段", "总局数"]),
  );
  const records = [];

  for (let index = 0; index + 6 < dataLines.length; index += 7) {
    const rank = parseNumber(dataLines[index]);
    if (!rank) break;
    records.push(
      normalizeRankingRecord(
        {
          rank,
          platformName: dataLines[index + 1],
          userName: dataLines[index + 2],
          warehouseValue: parseNumber(dataLines[index + 3]),
          defeatedAgents: parseNumber(dataLines[index + 4]),
          decryptedBricks: parseNumber(dataLines[index + 5]),
          totalRounds: parseNumber(dataLines[index + 6]),
        },
        { capturedAt, source: "playwright", rankingType: "score" },
      ),
    );
  }
  return records;
}

function parseDefeatRanking(text, capturedAt) {
  const dataLines = trimAtPagination(
    sliceAfterSequence(linesFromText(text), ["选手名称", "击败干员总数", "总对局数"]),
  );
  const records = [];

  for (let index = 0; index + 4 < dataLines.length; index += 5) {
    const rank = parseNumber(dataLines[index]);
    if (!rank) break;
    records.push(
      normalizeRankingRecord(
        {
          rank,
          platformName: dataLines[index + 1],
          userName: dataLines[index + 2],
          defeatedAgents: parseNumber(dataLines[index + 3]),
          totalRounds: parseNumber(dataLines[index + 4]),
        },
        { capturedAt, source: "playwright", rankingType: "defeat" },
      ),
    );
  }
  return records;
}

export async function fetchByPlaywright(targetUrl, capturedAt, options = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Playwright is not installed. Run npm install if direct API discovery fails.");
  }

  const browser = await chromium.launch({ headless: options.headless !== false });
  const page = await browser.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const scoreText = await page.locator("body").innerText();
    const records = parseScoreRanking(scoreText, capturedAt);

    await page.getByText("击败排行榜", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const defeatText = await page.locator("body").innerText();
    records.push(...parseDefeatRanking(defeatText, capturedAt));

    if (!records.length) throw new Error("no rendered ranking rows found");
    return records;
  } finally {
    await browser.close();
  }
}
