export interface UsageBar {
  id: string;
  label: string;
  used: number;
  limit: number;
  unit?: string;
}

export interface UsageDashboardData {
  source: "live" | "demo";
  billingCycleStart?: string;
  billingCycleEnd?: string;
  planName?: string;
  bars: UsageBar[];
  fetchedAt: string;
  notes?: string[];
}

interface AuthUsageResponse {
  startOfMonth?: string;
  gpt4?: { numRequests?: number; numRequestsTotal?: number; maxRequestUsage?: number | null };
  "gpt-4"?: { numRequests?: number; numRequestsTotal?: number; maxRequestUsage?: number | null };
  gpt35?: { numRequests?: number; maxRequestUsage?: number | null };
  "gpt-3.5-turbo"?: { numRequests?: number; maxRequestUsage?: number | null };
  [key: string]: unknown;
}

interface PeriodUsageResponse {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  plan?: { name?: string } | string;
  planUsage?: {
    totalSpend?: number;
    includedSpend?: number;
    limit?: number;
    remaining?: number;
  };
  displayMessage?: string;
  totalUsage?: number;
  limit?: number;
  individualUsage?: Record<
    string,
    {
      used?: number;
      limit?: number;
      remaining?: number;
    }
  >;
  modelUsage?: Record<string, { used?: number; limit?: number }>;
  [key: string]: unknown;
}

function demoData(reason?: string): UsageDashboardData {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    source: "demo",
    planName: "Demo Plan",
    billingCycleStart: start.toISOString().slice(0, 10),
    billingCycleEnd: end.toISOString().slice(0, 10),
    fetchedAt: now.toISOString(),
    notes: [
      reason || "Showing demo data (no Cursor auth token or API unavailable).",
      "Open Cursor while signed in so state.vscdb contains an access token.",
    ],
    bars: [
      { id: "cursor-models", label: "Cursor Models", used: 420, limit: 500, unit: "requests" },
      { id: "other-models", label: "Other Models / API", used: 75, limit: 250, unit: "requests" },
      { id: "claude-sonnet", label: "claude-4-sonnet", used: 310, limit: 400, unit: "requests" },
      { id: "gpt-4o", label: "gpt-4o", used: 88, limit: 200, unit: "requests" },
      { id: "gemini", label: "gemini-2.5-pro", used: 45, limit: 150, unit: "requests" },
    ],
  };
}

async function getJson(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, init);
  let json: unknown = undefined;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatDate(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : undefined;
  }
  return d.toISOString().slice(0, 10);
}

function barsFromAuthUsage(data: AuthUsageResponse): UsageBar[] {
  const bars: UsageBar[] = [];
  const entries: Array<[string, string]> = [
    ["gpt-4", "GPT-4 / Cursor Models"],
    ["gpt4", "GPT-4 / Cursor Models"],
    ["gpt-3.5-turbo", "GPT-3.5"],
    ["gpt35", "GPT-3.5"],
  ];

  const seen = new Set<string>();
  for (const [key, label] of entries) {
    const block = data[key] as
      | { numRequests?: number; numRequestsTotal?: number; maxRequestUsage?: number | null }
      | undefined;
    if (!block || seen.has(label)) {
      continue;
    }
    const used = asNumber(block.numRequestsTotal) ?? asNumber(block.numRequests) ?? 0;
    const limit = asNumber(block.maxRequestUsage ?? undefined);
    if (limit === undefined && used === 0) {
      continue;
    }
    bars.push({
      id: key,
      label,
      used,
      limit: limit ?? Math.max(used, 1),
      unit: "requests",
    });
    seen.add(label);
  }

  // Any other model-like objects on the payload
  for (const [key, value] of Object.entries(data)) {
    if (["startOfMonth", "gpt4", "gpt-4", "gpt35", "gpt-3.5-turbo"].includes(key)) {
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    const obj = value as {
      numRequests?: number;
      numRequestsTotal?: number;
      maxRequestUsage?: number | null;
    };
    const used = asNumber(obj.numRequestsTotal) ?? asNumber(obj.numRequests);
    const limit = asNumber(obj.maxRequestUsage ?? undefined);
    if (used === undefined && limit === undefined) {
      continue;
    }
    bars.push({
      id: key,
      label: key,
      used: used ?? 0,
      limit: limit ?? Math.max(used ?? 0, 1),
      unit: "requests",
    });
  }

  return bars;
}

function barsFromPeriodUsage(data: PeriodUsageResponse): UsageBar[] {
  const bars: UsageBar[] = [];
  const planUsage = data.planUsage;
  if (planUsage) {
    const used =
      asNumber(planUsage.totalSpend) ??
      asNumber(planUsage.includedSpend) ??
      asNumber(data.totalUsage) ??
      0;
    const limit = asNumber(planUsage.limit) ?? asNumber(data.limit);
    if (limit !== undefined) {
      bars.push({
        id: "plan-pool",
        label: "Cursor Models",
        used,
        limit,
        unit: "credits",
      });
    }
  }

  const individual = data.individualUsage || data.modelUsage;
  if (individual && typeof individual === "object") {
    for (const [key, value] of Object.entries(individual)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const used = asNumber(value.used) ?? 0;
      const limit = asNumber(value.limit) ?? Math.max(used, 1);
      const label =
        key === "cursor" || key === "cursorModels"
          ? "Cursor Models"
          : key === "api" || key === "other" || key === "otherModels"
            ? "Other Models / API"
            : key;
      bars.push({
        id: `period-${key}`,
        label,
        used,
        limit,
        unit: "credits",
      });
    }
  }

  return bars;
}

function mergeBars(...groups: UsageBar[][]): UsageBar[] {
  const map = new Map<string, UsageBar>();
  for (const group of groups) {
    for (const bar of group) {
      const existing = map.get(bar.label.toLowerCase());
      if (!existing) {
        map.set(bar.label.toLowerCase(), bar);
      } else {
        // Prefer the entry with a higher limit / more recent-looking usage
        if (bar.limit >= existing.limit) {
          map.set(bar.label.toLowerCase(), bar);
        }
      }
    }
  }
  return Array.from(map.values());
}

function barsFromUsageSummary(summary: Record<string, unknown> | undefined): UsageBar[] {
  if (!summary) {
    return [];
  }

  const bars: UsageBar[] = [];
  const individual = summary.individualUsage as
    | {
        plan?: {
          used?: number;
          limit?: number;
          remaining?: number;
          autoPercentUsed?: number;
          apiPercentUsed?: number;
          totalPercentUsed?: number;
        };
        onDemand?: { used?: number; limit?: number | null; enabled?: boolean };
      }
    | undefined;

  const plan = individual?.plan;
  if (plan) {
    const limit = asNumber(plan.limit);
    const used = asNumber(plan.used);
    const autoPct = asNumber(plan.autoPercentUsed);
    const apiPct = asNumber(plan.apiPercentUsed);

    // Prefer the two named pools Cursor shows in the spending dashboard.
    if (autoPct !== undefined && limit !== undefined && limit > 0) {
      bars.push({
        id: "cursor-models",
        label: "Cursor Models",
        used: (autoPct / 100) * limit,
        limit,
        unit: "credits",
      });
    }
    if (apiPct !== undefined && limit !== undefined && limit > 0) {
      bars.push({
        id: "other-models",
        label: "Other Models / API",
        used: (apiPct / 100) * limit,
        limit,
        unit: "credits",
      });
    }

    if (bars.length === 0 && used !== undefined && limit !== undefined && limit > 0) {
      bars.push({
        id: "plan-pool",
        label: "Plan usage",
        used,
        limit,
        unit: "credits",
      });
    }
  }

  const onDemand = individual?.onDemand;
  if (onDemand?.enabled) {
    const used = asNumber(onDemand.used) ?? 0;
    const limit = asNumber(onDemand.limit ?? undefined);
    if (limit !== undefined && limit > 0) {
      bars.push({
        id: "on-demand",
        label: "On-demand",
        used,
        limit,
        unit: "cents",
      });
    } else if (used > 0) {
      bars.push({
        id: "on-demand",
        label: "On-demand",
        used,
        limit: Math.max(used, 100),
        unit: "cents",
      });
    }
  }

  return bars;
}

function aggregateFromUsageEvents(events: unknown): UsageBar[] {
  if (!Array.isArray(events)) {
    return [];
  }

  const byModel = new Map<string, number>();
  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }
    const e = event as Record<string, unknown>;
    const model =
      (typeof e.model === "string" && e.model) ||
      (typeof e.modelName === "string" && e.modelName) ||
      undefined;
    if (!model) {
      continue;
    }
    const tokenUsage =
      e.tokenUsage && typeof e.tokenUsage === "object"
        ? (e.tokenUsage as Record<string, unknown>)
        : undefined;
    const cost =
      asNumber(e.requestsCosts) ??
      asNumber(e.chargedCents) ??
      asNumber(tokenUsage?.totalCents) ??
      asNumber(e.totalTokens) ??
      asNumber(e.count) ??
      1;
    byModel.set(model, (byModel.get(model) ?? 0) + cost);
  }

  const totals = Array.from(byModel.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxUsed = totals[0]?.[1] ?? 0;

  return totals.map(([model, used]) => ({
    id: `model-${model}`,
    label: model,
    used,
    // Events endpoint has no hard per-model quota; scale bars relative to top model.
    limit: Math.max(maxUsed, used, 1),
    unit: "cost units",
  }));
}

async function fetchAuthUsage(token: string): Promise<AuthUsageResponse | undefined> {
  const result = await getJson("https://api2.cursor.sh/auth/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "cursor-ai-dashboard/0.1",
    },
  });
  if (!result.ok) {
    return undefined;
  }
  return result.json as AuthUsageResponse;
}

async function fetchPeriodUsage(token: string): Promise<PeriodUsageResponse | undefined> {
  // Connect protocol: JSON body with empty request is commonly accepted for this RPC
  const result = await getJson(
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "User-Agent": "cursor-ai-dashboard/0.1",
      },
      body: "{}",
    }
  );
  if (!result.ok) {
    return undefined;
  }
  return result.json as PeriodUsageResponse;
}

async function fetchUsageSummary(token: string): Promise<Record<string, unknown> | undefined> {
  const result = await getJson("https://cursor.com/api/usage-summary", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `WorkosCursorSessionToken=${encodeURIComponent(token)}`,
      Accept: "application/json",
      "User-Agent": "cursor-ai-dashboard/0.1",
    },
  });
  if (!result.ok) {
    return undefined;
  }
  return result.json as Record<string, unknown>;
}

async function fetchFilteredUsageEvents(token: string): Promise<unknown[] | undefined> {
  const result = await getJson("https://cursor.com/api/dashboard/get-filtered-usage-events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `WorkosCursorSessionToken=${encodeURIComponent(token)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://cursor.com",
      "User-Agent": "cursor-ai-dashboard/0.1",
    },
    body: JSON.stringify({ page: 1, pageSize: 200 }),
  });
  if (!result.ok || !result.json || typeof result.json !== "object") {
    return undefined;
  }
  const payload = result.json as { usageEventsDisplay?: unknown[] };
  return Array.isArray(payload.usageEventsDisplay) ? payload.usageEventsDisplay : undefined;
}

export async function fetchDashboardUsage(
  token: string | undefined,
  forceDemo = false
): Promise<UsageDashboardData> {
  if (forceDemo || !token) {
    return demoData(!token ? "No Cursor access token found in state.vscdb." : undefined);
  }

  const notes: string[] = [];
  let authUsage: AuthUsageResponse | undefined;
  let periodUsage: PeriodUsageResponse | undefined;
  let summary: Record<string, unknown> | undefined;
  let usageEvents: unknown[] | undefined;

  try {
    authUsage = await fetchAuthUsage(token);
    if (!authUsage) {
      notes.push("auth/usage request failed or returned non-OK.");
    }
  } catch (err) {
    notes.push(`auth/usage error: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    periodUsage = await fetchPeriodUsage(token);
    if (!periodUsage) {
      notes.push("GetCurrentPeriodUsage failed or returned non-OK.");
    }
  } catch (err) {
    notes.push(
      `GetCurrentPeriodUsage error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    summary = await fetchUsageSummary(token);
    if (!summary) {
      notes.push("usage-summary unavailable (cookie/token may be required).");
    }
  } catch {
    notes.push("usage-summary request failed.");
  }

  try {
    usageEvents = await fetchFilteredUsageEvents(token);
    if (!usageEvents) {
      notes.push("filtered usage events unavailable.");
    }
  } catch {
    notes.push("filtered usage events request failed.");
  }

  const eventBars = aggregateFromUsageEvents(
    usageEvents ??
      summary?.usageEventsDisplay ??
      summary?.usageEvents ??
      summary?.events ??
      periodUsage?.usageEvents ??
      (periodUsage as { filteredUsageEvents?: unknown } | undefined)?.filteredUsageEvents
  );

  let bars = mergeBars(
    barsFromUsageSummary(summary),
    barsFromPeriodUsage(periodUsage || {}),
    barsFromAuthUsage(authUsage || {}),
    eventBars
  );

  // Ensure named pools exist when we only have aggregate numbers
  if (bars.length === 0 && periodUsage) {
    const used = asNumber(periodUsage.totalUsage) ?? 0;
    const limit = asNumber(periodUsage.limit) ?? 0;
    if (limit > 0) {
      bars = [
        { id: "cursor-models", label: "Cursor Models", used, limit, unit: "credits" },
        {
          id: "other-models",
          label: "Other Models / API",
          used: Math.round(used * 0.15),
          limit: Math.max(limit, 1),
          unit: "credits",
        },
      ];
    }
  }

  if (bars.length === 0) {
    return demoData("Live APIs responded but no usage pools were found.");
  }

  // Prefer stable ordering: pools first, then models
  const poolOrder = ["cursor models", "other models / api", "gpt-4 / cursor models"];
  bars.sort((a, b) => {
    const ai = poolOrder.indexOf(a.label.toLowerCase());
    const bi = poolOrder.indexOf(b.label.toLowerCase());
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
    return b.used - a.used;
  });

  const planName =
    (typeof periodUsage?.plan === "string" && periodUsage.plan) ||
    (typeof periodUsage?.plan === "object" && periodUsage.plan?.name) ||
    (typeof summary?.planName === "string" && (summary.planName as string)) ||
    (typeof summary?.membershipType === "string" && (summary.membershipType as string)) ||
    undefined;

  return {
    source: "live",
    planName,
    billingCycleStart:
      formatDate(periodUsage?.billingCycleStart) ||
      formatDate(authUsage?.startOfMonth) ||
      formatDate(summary?.billingCycleStart),
    billingCycleEnd:
      formatDate(periodUsage?.billingCycleEnd) || formatDate(summary?.billingCycleEnd),
    bars,
    fetchedAt: new Date().toISOString(),
    notes: notes.length ? notes : undefined,
  };
}
