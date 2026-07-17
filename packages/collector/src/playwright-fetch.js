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

async function currentPageNumber(page) {
  const text = await page
    .locator(".bg3_con .page .on")
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => "1");
  return Number(text.trim()) || 1;
}

async function pageSignature(page) {
  return page.locator(".bg3_con").innerText({ timeout: 5000 });
}

async function goToFirstRankingPage(page) {
  const firstPage = page.locator(".bg3_con .page a", { hasText: "首页" }).first();
  if (await firstPage.isVisible().catch(() => false)) {
    await firstPage.click();
    await page.waitForTimeout(800);
  }
}

async function clickNextRankingPage(page) {
  const beforePage = await currentPageNumber(page);
  const beforeSignature = await pageSignature(page);
  const next = page.locator(".bg3_con .page a", { hasText: "下一页" }).first();

  if (!(await next.isVisible().catch(() => false))) return false;
  await next.click();
  await page.waitForTimeout(900);

  const afterPage = await currentPageNumber(page);
  const afterSignature = await pageSignature(page);
  return afterPage !== beforePage || afterSignature !== beforeSignature;
}

function dedupeRecords(records) {
  return [
    ...new Map(
      records.map((record) => [
        `${record.rankingType}:${record.playerId}:${record.rank}:${record.platformFilter}:${record.stage}`,
        record,
      ]),
    ).values(),
  ];
}

async function collectPaginatedRanking(page, capturedAt, parseRanking, options = {}) {
  const maxPages = options.maxPages ?? 200;
  const records = [];
  const seenPages = new Set();

  await goToFirstRankingPage(page);

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageNumber = await currentPageNumber(page);
    const text = await page.locator("body").innerText();
    const pageRecords = parseRanking(text, capturedAt);
    const signature = `${pageNumber}:${pageRecords.map((record) => `${record.rank}:${record.playerId}`).join("|")}`;

    if (seenPages.has(signature)) break;
    seenPages.add(signature);
    records.push(...pageRecords);

    if (!(await clickNextRankingPage(page))) break;
  }

  return dedupeRecords(records);
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

    const records = await collectPaginatedRanking(page, capturedAt, parseScoreRanking);

    await page.getByText("击败排行榜", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    records.push(...(await collectPaginatedRanking(page, capturedAt, parseDefeatRanking)));

    if (!records.length) throw new Error("no rendered ranking rows found");
    return dedupeRecords(records);
  } finally {
    await browser.close();
  }
}
