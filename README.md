# Cursor AI Dashboard

A Cursor / VS Code extension that opens an editor-area webview and shows horizontal usage bars for each Cursor model / usage pool.

## Features

- **Cursor AI Dashboard: Open** — opens the dashboard in the editor
- **Cursor AI Dashboard: Refresh** — reloads usage data
- Reads the Cursor auth token from local `state.vscdb` (Windows + WSL-aware paths)
- Fetches usage from Cursor APIs (`auth/usage`, `GetCurrentPeriodUsage`, optional `usage-summary`)
- Aggregates per-model usage from filtered usage events when available
- Falls back to demo/mock data so the UI works without API access

## Develop

```bash
npm install
npm run compile
```

Then press F5 in VS Code/Cursor (or use **Developer: Install Extension from Location…**) against this folder.

## Notes

Token extraction depends on Cursor desktop having signed-in session data in `state.vscdb`. On WSL, the extension also probes `/mnt/c/Users/*/AppData/Roaming/Cursor/...`.
