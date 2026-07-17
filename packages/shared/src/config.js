import path from "node:path";
import process from "node:process";

export const projectRoot = path.resolve(import.meta.dirname, "../../..");

export function getOutputDir() {
  return path.resolve(projectRoot, process.env.OUTPUT_DIR ?? "data");
}

export function getDataPaths(outputDir = getOutputDir()) {
  return {
    outputDir,
    snapshots: path.join(outputDir, "ranking-snapshots.jsonl"),
    historyCsv: path.join(outputDir, "ranking-history.csv"),
    latestCsv: path.join(outputDir, "ranking-latest.csv"),
    watchlist: path.join(outputDir, "watchlist.json"),
  };
}

