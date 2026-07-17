# df-rank-watcher

Local collector and viewer for Delta Force event ranking data.

## Commands

```sh
npm run collector:once
npm run collector:start
npm run viewer:start
```

Open `http://localhost:3000` after starting the viewer.

The collector and viewer are intentionally separate. The collector writes local files under `data/`; the viewer only reads those files and stores the local watchlist in `data/watchlist.json`.
