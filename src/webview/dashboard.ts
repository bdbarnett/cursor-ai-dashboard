import {
  ModelRow,
  PoolMeter,
  SpendSlice,
  UsageDashboardData,
} from "../api";

export interface DashboardViewOptions {
  loading?: boolean;
  error?: string;
}

const SLICE_COLORS = ["#3d8f6e", "#c29a3a", "#5b8def", "#c24b4b", "#9b6bce"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString();
}

function formatEfficiency(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) {
    return "—";
  }
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function renderPools(pools: PoolMeter[]): string {
  if (!pools.length) {
    return "";
  }
  const rows = pools
    .map((pool) => {
      const percent = Math.max(0, Math.min(100, pool.percentUsed));
      const cls = levelClass(percent);
      return `
        <section class="bar-row" aria-label="${escapeHtml(pool.label)}">
          <div class="bar-meta">
            <div>
              <span class="bar-label">${escapeHtml(pool.label)}</span>
              ${pool.detail ? `<div class="bar-detail">${escapeHtml(pool.detail)}</div>` : ""}
            </div>
            <span class="bar-values">
              ${escapeHtml(formatUsdFromCents(pool.usedCredits))} / ${escapeHtml(
                formatUsdFromCents(pool.limitCredits)
              )}
              <span class="pct ${cls}">${percent.toFixed(0)}%</span>
            </span>
          </div>
          <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(0)}">
            <div class="fill ${cls}" style="width:${percent.toFixed(1)}%"></div>
          </div>
        </section>`;
    })
    .join("\n");

  return `<h2>Usage pools</h2>
    <p class="section-note">Meters against your included plan allowance.</p>
    <div class="bars">${rows}</div>`;
}

function renderDonut(slices: SpendSlice[]): string {
  if (!slices.length) {
    return "";
  }
  const total = slices.reduce((s, x) => s + x.cents, 0);
  if (total <= 0) {
    return "";
  }

  let cursor = 0;
  const stops: string[] = [];
  const legend: string[] = [];
  slices.forEach((slice, i) => {
    const start = (cursor / total) * 100;
    cursor += slice.cents;
    const end = (cursor / total) * 100;
    const color = SLICE_COLORS[i % SLICE_COLORS.length];
    stops.push(`${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    const pct = (slice.cents / total) * 100;
    legend.push(`
      <li>
        <span class="swatch" style="background:${color}"></span>
        <span class="legend-label">${escapeHtml(slice.label)}</span>
        <span class="legend-value">${escapeHtml(formatUsdFromCents(slice.cents))} · ${pct.toFixed(0)}%</span>
      </li>`);
  });

  return `<h2>Spend composition</h2>
    <p class="section-note">Where period spend came from (included vs bonus / on-demand).</p>
    <div class="compose">
      <div class="donut" style="background: conic-gradient(${stops.join(", ")})" role="img" aria-label="Spend composition"></div>
      <ul class="legend">${legend.join("")}</ul>
    </div>`;
}

function renderModelTable(models: ModelRow[]): string {
  if (!models.length) {
    return "";
  }

  const body = models
    .map((m) => {
      const badges = [
        m.tier !== undefined ? `<span class="badge">tier ${m.tier}</span>` : "",
        m.isAutoBucket ? `<span class="badge auto">auto</span>` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr>
        <td>
          <div class="model-name">${escapeHtml(m.model)}</div>
          <div class="model-meta">${badges}</div>
        </td>
        <td class="num">${escapeHtml(formatUsdFromCents(m.cents))}</td>
        <td class="num">${m.sharePct.toFixed(1)}%</td>
        <td class="num">${escapeHtml(formatEfficiency(m.dollarsPerMillionTokens))}</td>
        <td class="num">${escapeHtml(formatTokens(m.inputTokens))}</td>
        <td class="num">${escapeHtml(formatTokens(m.outputTokens))}</td>
        <td class="num">${escapeHtml(formatTokens(m.cacheReadTokens))}</td>
      </tr>`;
    })
    .join("\n");

  return `<h2>Spend by model</h2>
    <p class="section-note">No per-model cap. $/M is USD per million input+output tokens (excludes cache reads).</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th class="num">Spend</th>
            <th class="num">Share</th>
            <th class="num">$/M tok</th>
            <th class="num">In</th>
            <th class="num">Out</th>
            <th class="num">Cache read</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderTotals(data: UsageDashboardData): string {
  const t = data.totals;
  if (!t) {
    return "";
  }
  const cells = [
    t.totalCostCents !== undefined
      ? ["Total spend", formatUsdFromCents(t.totalCostCents)]
      : undefined,
    t.includedSpendCents !== undefined
      ? ["Included", formatUsdFromCents(t.includedSpendCents)]
      : undefined,
    t.bonusSpendCents !== undefined
      ? ["Bonus", formatUsdFromCents(t.bonusSpendCents)]
      : undefined,
    t.totalInputTokens !== undefined
      ? ["Input tokens", formatTokens(t.totalInputTokens)]
      : undefined,
    t.totalOutputTokens !== undefined
      ? ["Output tokens", formatTokens(t.totalOutputTokens)]
      : undefined,
    t.totalCacheReadTokens !== undefined
      ? ["Cache read", formatTokens(t.totalCacheReadTokens)]
      : undefined,
  ].filter(Boolean) as Array<[string, string]>;

  if (!cells.length) {
    return "";
  }

  return `<div class="totals">${cells
    .map(
      ([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("")}</div>`;
}

function renderBurn(data: UsageDashboardData): string {
  if (!data.burn) {
    return "";
  }
  const parts = [
    `${formatUsdFromCents(data.burn.spendPerDayCents)}/day average`,
    data.daysRemaining !== undefined ? `${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"} left` : undefined,
    data.burn.includedRemainingCents > 0
      ? `${formatUsdFromCents(data.burn.includedRemainingCents)} included remaining`
      : "included allowance exhausted",
  ].filter(Boolean);
  return `<div class="burn">${escapeHtml(parts.join(" · "))}</div>`;
}

export function getDashboardHtml(
  data: UsageDashboardData | undefined,
  options: DashboardViewOptions = {}
): string {
  const loading = Boolean(options.loading);
  const error = options.error;
  const cycle =
    data?.billingCycleStart || data?.billingCycleEnd
      ? `${data?.billingCycleStart ?? "?"} → ${data?.billingCycleEnd ?? "?"}`
      : "Billing cycle unavailable";
  const daysBit =
    data?.daysRemaining !== undefined
      ? ` · ${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"} left`
      : "";
  const planLine = [data?.planName, data?.planPrice].filter(Boolean).join(" · ");
  const messages =
    data?.messages?.map((m) => `<li>${escapeHtml(m)}</li>`).join("") ?? "";
  const notes = data?.notes?.map((n) => `<li>${escapeHtml(n)}</li>`).join("") ?? "";
  const autoNote =
    data?.autoBucketModels && data.autoBucketModels.length
      ? `<p class="section-note">Auto bucket models: ${escapeHtml(
          data.autoBucketModels.slice(0, 12).join(", ")
        )}${data.autoBucketModels.length > 12 ? "…" : ""}</p>`
      : "";

  const hasBody =
    (data?.pools?.length ?? 0) > 0 ||
    (data?.composition?.length ?? 0) > 0 ||
    (data?.models?.length ?? 0) > 0;

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
      margin-bottom: 18px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }
    h2 {
      margin: 22px 0 6px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--muted);
    }
    .section-note {
      margin: 0 0 10px;
      max-width: 960px;
      color: var(--muted);
      font-size: 12px;
    }
    .subtitle, .meta { color: var(--muted); font-size: 12.5px; }
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
      margin: 0 0 14px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--warn);
      background: var(--card);
      color: var(--muted);
      font-size: 12.5px;
    }
    .banner.error { border-left-color: var(--crit); }
    .messages {
      margin: 0 0 12px;
      padding: 10px 12px 10px 28px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--fg);
      font-size: 12.5px;
    }
    .messages li { margin: 4px 0; }
    .burn {
      margin: 0 0 14px;
      max-width: 960px;
      color: var(--muted);
      font-size: 12.5px;
    }
    .totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      max-width: 960px;
      margin-bottom: 8px;
    }
    .totals > div {
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 6px;
      padding: 10px 12px;
    }
    .totals span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 4px;
    }
    .totals strong { font-size: 15px; font-weight: 600; }
    .bars { display: flex; flex-direction: column; gap: 12px; max-width: 960px; }
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
    .bar-detail { margin-top: 2px; color: var(--muted); font-size: 11.5px; }
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
    .compose {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 24px;
      max-width: 960px;
      margin-bottom: 4px;
    }
    .donut {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      mask: radial-gradient(circle at center, transparent 52%, #000 53%);
      -webkit-mask: radial-gradient(circle at center, transparent 52%, #000 53%);
      border: 1px solid var(--border);
      flex: 0 0 auto;
    }
    .legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 220px;
    }
    .legend li {
      display: grid;
      grid-template-columns: 12px 1fr auto;
      gap: 10px;
      align-items: center;
      font-size: 12.5px;
    }
    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      display: inline-block;
    }
    .legend-label { color: var(--fg); }
    .legend-value { color: var(--muted); white-space: nowrap; }
    .table-wrap {
      max-width: 1100px;
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .model-name { font-weight: 600; }
    .model-meta { margin-top: 3px; display: flex; gap: 6px; flex-wrap: wrap; }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge.auto {
      border-color: color-mix(in srgb, var(--ok) 50%, var(--border));
      color: var(--ok);
    }
    .empty { color: var(--muted); font-size: 13px; padding: 18px 0; }
    footer {
      margin-top: 22px;
      max-width: 960px;
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
      <div class="subtitle">${planLine ? escapeHtml(planLine) + " · " : ""}${escapeHtml(
        cycle
      )}${escapeHtml(daysBit)}</div>
      <div class="meta">${
        data?.fetchedAt
          ? "Updated " + escapeHtml(new Date(data.fetchedAt).toLocaleString())
          : "Waiting for data"
      }</div>
      ${data ? `<span class="source ${data.source}">${data.source}</span>` : ""}
    </div>
    <button id="refreshBtn" ${loading ? "disabled" : ""}>Refresh</button>
  </header>
  ${error ? `<div class="banner error">Live fetch issue: ${escapeHtml(error)}. Showing fallback data when available.</div>` : ""}
  ${loading ? `<div class="banner">Refreshing usage…</div>` : ""}
  ${messages ? `<ul class="messages">${messages}</ul>` : ""}
  ${data ? renderBurn(data) : ""}
  ${data ? renderTotals(data) : ""}
  ${data ? renderPools(data.pools || []) : ""}
  ${data ? renderDonut(data.composition || []) : ""}
  ${data ? renderModelTable(data.models || []) : ""}
  ${autoNote}
  ${!loading && !hasBody ? `<div class="empty">No usage data to display yet.</div>` : ""}
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
