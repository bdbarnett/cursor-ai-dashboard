import { UsageDashboardData } from "../api";

export interface DashboardViewOptions {
  loading?: boolean;
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pct(used: number, limit: number): number {
  if (!limit || limit <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

function levelClass(percent: number): string {
  if (percent > 90) {
    return "critical";
  }
  if (percent > 70) {
    return "warning";
  }
  return "ok";
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) {
    return n.toLocaleString();
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function getDashboardHtml(
  data: UsageDashboardData | undefined,
  options: DashboardViewOptions = {}
): string {
  const loading = Boolean(options.loading);
  const error = options.error;
  const bars = data?.bars ?? [];
  const cycle =
    data?.billingCycleStart || data?.billingCycleEnd
      ? `${data?.billingCycleStart ?? "?"} → ${data?.billingCycleEnd ?? "?"}`
      : "Billing cycle unavailable";

  const barRows = bars
    .map((bar) => {
      const percent = pct(bar.used, bar.limit);
      const cls = levelClass(percent);
      const unit = bar.unit ? ` ${escapeHtml(bar.unit)}` : "";
      return `
        <section class="bar-row" aria-label="${escapeHtml(bar.label)}">
          <div class="bar-meta">
            <span class="bar-label">${escapeHtml(bar.label)}</span>
            <span class="bar-values">${formatNum(bar.used)} / ${formatNum(bar.limit)}${unit}
              <span class="pct ${cls}">${percent.toFixed(0)}%</span>
            </span>
          </div>
          <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(0)}">
            <div class="fill ${cls}" style="width:${percent.toFixed(1)}%"></div>
          </div>
        </section>`;
    })
    .join("\n");

  const notes =
    data?.notes?.map((n) => `<li>${escapeHtml(n)}</li>`).join("") ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cursor AI Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #9d9d9d);
      --border: var(--vscode-panel-border, #3c3c3c);
      --track: var(--vscode-input-background, #2a2a2a);
      --accent: var(--vscode-button-background, #0e639c);
      --accent-fg: var(--vscode-button-foreground, #ffffff);
      --ok: #3d8f6e;
      --warn: #c29a3a;
      --crit: #c24b4b;
      --card: color-mix(in srgb, var(--bg) 92%, var(--fg) 8%);
      --font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 28px 40px;
      font-family: var(--font);
      color: var(--fg);
      background:
        radial-gradient(1200px 500px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%),
        var(--bg);
      line-height: 1.45;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 22px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    .subtitle, .meta {
      color: var(--muted);
      font-size: 12.5px;
    }
    .meta { margin-top: 4px; }
    button {
      appearance: none;
      border: 1px solid color-mix(in srgb, var(--accent) 70%, var(--border));
      background: var(--accent);
      color: var(--accent-fg);
      border-radius: 4px;
      padding: 7px 14px;
      font: inherit;
      font-size: 12.5px;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.08); }
    button:disabled { opacity: 0.6; cursor: default; }
    .banner {
      margin: 0 0 16px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--warn);
      background: var(--card);
      color: var(--muted);
      font-size: 12.5px;
    }
    .banner.error { border-left-color: var(--crit); }
    .bars { display: flex; flex-direction: column; gap: 14px; max-width: 820px; }
    .bar-row {
      padding: 12px 14px;
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 6px;
    }
    .bar-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .bar-label { font-weight: 600; }
    .bar-values { color: var(--muted); white-space: nowrap; }
    .pct { margin-left: 8px; font-variant-numeric: tabular-nums; }
    .pct.ok { color: var(--ok); }
    .pct.warning { color: var(--warn); }
    .pct.critical { color: var(--crit); }
    .track {
      height: 10px;
      border-radius: 999px;
      background: var(--track);
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      transition: width 240ms ease;
      background: linear-gradient(90deg, color-mix(in srgb, var(--ok) 80%, #000), var(--ok));
    }
    .fill.warning {
      background: linear-gradient(90deg, color-mix(in srgb, var(--warn) 75%, #000), var(--warn));
    }
    .fill.critical {
      background: linear-gradient(90deg, color-mix(in srgb, var(--crit) 75%, #000), var(--crit));
    }
    .empty {
      color: var(--muted);
      font-size: 13px;
      padding: 18px 0;
    }
    footer {
      margin-top: 22px;
      max-width: 820px;
      color: var(--muted);
      font-size: 12px;
    }
    footer ul { margin: 8px 0 0; padding-left: 18px; }
    .source {
      display: inline-block;
      margin-top: 8px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 11px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .source.live { border-color: color-mix(in srgb, var(--ok) 60%, var(--border)); color: var(--ok); }
    .source.demo { border-color: color-mix(in srgb, var(--warn) 60%, var(--border)); color: var(--warn); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Cursor AI Dashboard</h1>
      <div class="subtitle">${data?.planName ? escapeHtml(data.planName) + " · " : ""}${escapeHtml(cycle)}</div>
      <div class="meta">${data?.fetchedAt ? "Updated " + escapeHtml(new Date(data.fetchedAt).toLocaleString()) : "Waiting for data"}</div>
      ${data ? `<span class="source ${data.source}">${data.source}</span>` : ""}
    </div>
    <button id="refreshBtn" ${loading ? "disabled" : ""}>Refresh</button>
  </header>
  ${error ? `<div class="banner error">Live fetch issue: ${escapeHtml(error)}. Showing fallback data when available.</div>` : ""}
  ${loading ? `<div class="banner">Refreshing usage…</div>` : ""}
  <div class="bars">
    ${barRows || '<div class="empty">No usage bars to display yet.</div>'}
  </div>
  <footer>
    ${notes ? `<div>Notes</div><ul>${notes}</ul>` : ""}
  </footer>
  <script>
    const vscode = acquireVsCodeApi();
    const btn = document.getElementById('refreshBtn');
    btn?.addEventListener('click', () => {
      btn.disabled = true;
      vscode.postMessage({ type: 'refresh' });
    });
  </script>
</body>
</html>`;
}
