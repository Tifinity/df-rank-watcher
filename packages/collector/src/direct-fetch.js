import { normalizeRankingRecord } from "../../shared/src/index.js";

const rankingUrlPattern = /https?:\/\/[^"'`\\\s]+|(?<path>\/[^"'`\\\s]*?(?:rank|Rank|ranking|Ranking|list|List)[^"'`\\\s]*)/g;
const scriptPattern = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;

function absoluteUrl(url, baseUrl) {
  return new URL(url, baseUrl).toString();
}

function collectScriptUrls(html, targetUrl) {
  return [...html.matchAll(scriptPattern)].map((match) => absoluteUrl(match[1], targetUrl));
}

function collectCandidateUrls(text, baseUrl) {
  const urls = new Set();
  for (const match of text.matchAll(rankingUrlPattern)) {
    const value = match.groups?.path ?? match[0];
    if (!/(rank|ranking|list)/i.test(value)) continue;
    if (/\.(png|jpg|jpeg|gif|webp|css)$/i.test(value)) continue;
    try {
      urls.add(absoluteUrl(value, baseUrl));
    } catch {
      // Ignore malformed script fragments.
    }
  }
  return [...urls];
}

function findArrays(value, path = []) {
  const found = [];
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object" && ("userName" in item || "nickName" in item || "platName" in item))) {
      found.push({ path, value });
    }
    for (let index = 0; index < value.length; index += 1) {
      found.push(...findArrays(value[index], [...path, index]));
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(...findArrays(child, [...path, key]));
    }
  }
  return found;
}

function inferRankingType(path) {
  const text = path.join(".").toLowerCase();
  if (/kill|defeat|did|击败/.test(text)) return "defeat";
  return "score";
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      referer: "https://df.qq.com/cp/a20260611dfs/index.html",
      "user-agent": "Mozilla/5.0 df-rank-watcher",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const text = await response.text();
  const jsonText = text.replace(/^[\w$.]+\(/, "").replace(/\);?$/, "");
  return JSON.parse(jsonText);
}

export async function fetchByDiscoveredApi(targetUrl, capturedAt) {
  const pageResponse = await fetch(targetUrl, {
    headers: { "user-agent": "Mozilla/5.0 df-rank-watcher" },
  });
  if (!pageResponse.ok) throw new Error(`page fetch failed: ${pageResponse.status}`);
  const html = await pageResponse.text();

  const scriptUrls = collectScriptUrls(html, targetUrl);
  const scriptBodies = await Promise.allSettled(
    scriptUrls.map(async (url) => ({ url, text: await (await fetch(url)).text() })),
  );

  const candidateUrls = new Set(collectCandidateUrls(html, targetUrl));
  for (const result of scriptBodies) {
    if (result.status !== "fulfilled") continue;
    for (const url of collectCandidateUrls(result.value.text, result.value.url)) {
      candidateUrls.add(url);
    }
  }

  const records = [];
  const errors = [];
  for (const url of candidateUrls) {
    try {
      const payload = await fetchJson(url);
      for (const candidate of findArrays(payload)) {
        const rankingType = inferRankingType(candidate.path);
        for (const item of candidate.value) {
          records.push(normalizeRankingRecord(item, { capturedAt, source: url, rankingType }));
        }
      }
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  const deduped = new Map();
  for (const record of records) {
    deduped.set(`${record.rankingType}:${record.playerId}:${record.rank}`, record);
  }
  if (!deduped.size) {
    throw new Error(`no ranking records discovered${errors.length ? `; ${errors.slice(0, 3).join("; ")}` : ""}`);
  }
  return [...deduped.values()];
}

