# Cursor AI Dashboard

A Cursor / VS Code extension that opens an editor-area webview and shows horizontal usage bars for each Cursor model / usage pool.

## Features

- **Cursor AI Dashboard: Open** — opens the dashboard in the editor
- **Cursor AI Dashboard: Refresh** — reloads usage data
- Reads the Cursor auth token from local `state.vscdb` via Python sqlite3 (Windows + WSL-aware; needed because the DB can be multi-GB)
- Fetches usage from Cursor APIs (`auth/usage`, `GetCurrentPeriodUsage`, optional `usage-summary`)
- Aggregates per-model usage from filtered usage events when available
- Falls back to demo/mock data so the UI works without API access

## Develop

```bash
# in WSL
cd ~/gh/bdbarnett/cursor-ai-dashboard
source ~/.nvm/nvm.sh   # if needed
npm install
npm run compile
```

Then press **F5** (*Run Extension*), or install into the Cursor WSL remote host:

```bash
./scripts/install-cursor-wsl.sh
# Developer: Reload Window
```

Commands:

- `Cursor AI Dashboard: Open`
- `Cursor AI Dashboard: Refresh`

## Notes

Token extraction depends on Cursor desktop having signed-in session data in `state.vscdb`. On WSL, the extension probes `/mnt/c/Users/*/AppData/Roaming/Cursor/...` and queries it with **Windows `python.exe`** (Linux sqlite over `/mnt/c` fails on large WAL databases; `sql.js` cannot load multi-GB files).
