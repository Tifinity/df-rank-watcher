import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildWatchlistStats,
  getDataPaths,
  listPlayers,
  projectRoot,
  readHistoryRankings,
  readLatestRankings,
  readWatchlist,
  loadEnv,
  writeWatchlist,
} from "../../shared/src/index.js";

await loadEnv();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const publicDir = path.join(projectRoot, "packages/viewer/public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const paths = getDataPaths();

  if (request.method === "GET" && url.pathname === "/api/latest") {
    sendJson(response, 200, { records: await readLatestRankings(paths) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/players") {
    const latest = await readLatestRankings(paths);
    const history = latest.length ? latest : await readHistoryRankings(paths);
    sendJson(response, 200, { players: listPlayers(history) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/watchlist") {
    sendJson(response, 200, { playerIds: await readWatchlist(paths) });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/watchlist") {
    try {
      const body = JSON.parse(await readBody(request));
      const playerIds = await writeWatchlist(body.playerIds, paths);
      sendJson(response, 200, { playerIds });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/watchlist/stats") {
    const [watchlist, latest, history] = await Promise.all([
      readWatchlist(paths),
      readLatestRankings(paths),
      readHistoryRankings(paths),
    ]);
    sendJson(response, 200, { players: buildWatchlistStats(watchlist, latest, history) });
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = path.normalize(path.join(publicDir, requested));

  if (!resolved.startsWith(publicDir) || !existsSync(resolved)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(resolved);
  response.writeHead(200, { "content-type": contentTypes[ext] ?? "application/octet-stream" });
  response.end(await readFile(resolved));
}

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
    } else {
      await serveStatic(request, response);
    }
  } catch (error) {
    console.error(`[viewer] ${error.stack ?? error.message}`);
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`[viewer] http://${host}:${port}`);
});
