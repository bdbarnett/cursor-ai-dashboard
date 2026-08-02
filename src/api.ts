export interface PoolMeter {
  id: string;
  label: string;
  percentUsed: number;
  usedCredits: number;
  limitCredits: number;
  detail?: string;
}

export interface SpendSlice {
  id: string;
  label: string;
  cents: number;
}

export interface ModelRow {
  model: string;
  cents: number;
  sharePct: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** USD per million total tokens (in+out); null if no token volume */
  dollarsPerMillionTokens: number | null;
  tier?: number;
  isAutoBucket?: boolean;
}

export interface UsageDashboardData {
  source: "live" | "demo";
  billingCycleStart?: string;
  billingCycleEnd?: string;
  daysElapsed?: number;
  daysRemaining?: number;
  planName?: string;
  planPrice?: string;
  messages?: string[];
  pools: PoolMeter[];
  composition: SpendSlice[];
  models: ModelRow[];
  autoBucketModels?: string[];
  burn?: {
    spendPerDayCents: number;
    includedLimitCents: number;
    includedUsedCents: number;
    includedRemainingCents: number;
  };
  totals?: {
    totalCostCents?: number;
    includedSpendCents?: number;
    bonusSpendCents?: number;
    onDemandCents?: number;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalCacheReadTokens?: number;
    totalCacheWriteTokens?: number;
  };
  fetchedAt: string;
  notes?: string[];
}

interface PeriodUsageResponse {
  billingCycleStart?: string | number;
  billingCycleEnd?: string | number;
  planUsage?: {
    totalSpend?: number;
    includedSpend?: number;
    bonusSpend?: number;
    limit?: number;
    remaining?: number;
    autoPercentUsed?: number;
    apiPercentUsed?: number;
    totalPercentUsed?: number;
    bonusTooltip?: string;
  };
  displayMessage?: string;
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
  autoBucketModels?: string[];
  [key: string]: unknown;
}

interface AggregatedUsageResponse {
  aggregations?: Array<{
    modelIntent?: string;
    inputTokens?: string | number;
    outputTokens?: string | number;
    cacheWriteTokens?: string | number;
    cacheReadTokens?: string | number;
    totalCents?: number;
    tier?: number;
  }>;
  totalInputTokens?: string | number;
  totalOutputTokens?: string | number;
  totalCacheWriteTokens?: string | number;
  totalCacheReadTokens?: string | number;
  totalCostCents?: number;
}

function demoData(reason?: string): UsageDashboardData {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000));
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  return {
    source: "demo",
    planName: "Demo Plan",
    planPrice: "$20/mo",
    billingCycleStart: start.toISOString().slice(0, 10),
    billingCycleEnd: end.toISOString().slice(0, 10),
    daysElapsed,
    daysRemaining,
    fetchedAt: now.toISOString(),
    messages: ["Demo data — connect a live Cursor session for real usage."],
    notes: [
      reason || "Showing demo data (no Cursor auth token or API unavailable).",
      "Token is read from Cursor's state.vscdb (on WSL via Windows python.exe).",
    ],
    pools: [
      {
        id: "auto",
        label: "Auto / Cursor Models",
        percentUsed: 89,
        usedCredits: 356,
        limitCredits: 400,
        detail: "89% of included pool",
      },
      {
        id: "api",
        label: "API / Named Models",
        percentUsed: 100,
        usedCredits: 400,
        limitCredits: 400,
        detail: "100% of included pool",
      },
    ],
    composition: [
      { id: "included", label: "Included", cents: 40000 },
      { id: "bonus", label: "Bonus", cents: 12000 },
    ],
    models: [
      {
        model: "claude-4-sonnet",
        cents: 1240,
        sharePct: 45,
        inputTokens: 2_000_000,
        outputTokens: 400_000,
        cacheReadTokens: 8_000_000,
        cacheWriteTokens: 100_000,
        dollarsPerMillionTokens: 5.17,
        tier: 1,
      },
      {
        model: "default",
        cents: 880,
        sharePct: 32,
        inputTokens: 5_000_000,
        outputTokens: 800_000,
        cacheReadTokens: 20_000_000,
        cacheWriteTokens: 200_000,
        dollarsPerMillionTokens: 1.52,
        tier: 2,
        isAutoBucket: true,
      },
    ],
    autoBucketModels: ["default", "composer-2.5"],
    burn: {
      spendPerDayCents: 40000 / daysElapsed,
      includedLimitCents: 40000,
      includedUsedCents: 40000,
      includedRemainingCents: 0,
    },
    totals: {
      totalCostCents: 52000,
      includedSpendCents: 40000,
      bonusSpendCents: 12000,
      totalInputTokens: 7_000_000,
      totalOutputTokens: 1_200_000,
      totalCacheReadTokens: 28_000_000,
      totalCacheWriteTokens: 300_000,
    },
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    const n = typeof value === "number" ? value : Number(value);
    return n < 1e12 ? n * 1000 : n;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) {
      return t;
    }
  }
  return undefined;
}

function formatDate(value: unknown): string | undefined {
  const ms = toEpochMs(value);
  if (ms === undefined) {
    return undefined;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return d.toISOString().slice(0, 10);
}

function workosSessionCookie(token: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { sub?: string };
    if (!payload.sub) {
      return undefined;
    }
    return `WorkosCursorSessionToken=${encodeURIComponent(`${payload.sub}::${token}`)}`;
  } catch {
    return undefined;
  }
}

function authHeaders(token: string, cookie?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "cursor-ai-dashboard/0.1",
  };
  if (cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

function buildPools(
  period: PeriodUsageResponse | undefined,
  summary: Record<string, unknown> | undefined
): PoolMeter[] {
  const planUsage = period?.planUsage;
  const summaryPlan = (summary?.individualUsage as { plan?: Record<string, unknown> } | undefined)
    ?.plan;

  const limit =
    asNumber(planUsage?.limit) ?? asNumber(summaryPlan?.limit) ?? asNumber(summaryPlan?.used);
  const autoPct = asNumber(planUsage?.autoPercentUsed) ?? asNumber(summaryPlan?.autoPercentUsed);
  const apiPct = asNumber(planUsage?.apiPercentUsed) ?? asNumber(summaryPlan?.apiPercentUsed);

  const pools: PoolMeter[] = [];
  if (limit !== undefined && limit > 0 && autoPct !== undefined) {
    pools.push({
      id: "auto",
      label: "Auto / Cursor Models",
      percentUsed: autoPct,
      usedCredits: (autoPct / 100) * limit,
      limitCredits: limit,
      detail: `${autoPct.toFixed(1)}% of included pool`,
    });
  }
  if (limit !== undefined && limit > 0 && apiPct !== undefined) {
    pools.push({
      id: "api",
      label: "API / Named Models",
      percentUsed: apiPct,
      usedCredits: (apiPct / 100) * limit,
      limitCredits: limit,
      detail: `${apiPct.toFixed(1)}% of included pool`,
    });
  }
  return pools;
}

function buildComposition(
  period: PeriodUsageResponse | undefined,
  summary: Record<string, unknown> | undefined
): SpendSlice[] {
  const planUsage = period?.planUsage;
  const summaryPlan = (summary?.individualUsage as { plan?: Record<string, unknown> } | undefined)
    ?.plan;
  const breakdown = summaryPlan?.breakdown as
    | { included?: number; bonus?: number; total?: number }
    | undefined;
  const onDemand = (summary?.individualUsage as { onDemand?: Record<string, unknown> } | undefined)
    ?.onDemand;

  const included =
    asNumber(planUsage?.includedSpend) ??
    asNumber(breakdown?.included) ??
    asNumber(summaryPlan?.used);
  const bonus = asNumber(planUsage?.bonusSpend) ?? asNumber(breakdown?.bonus) ?? 0;
  const onDemandCents =
    onDemand?.enabled && asNumber(onDemand.used) !== undefined ? asNumber(onDemand.used)! : 0;

  const slices: SpendSlice[] = [];
  if (included !== undefined && included > 0) {
    slices.push({ id: "included", label: "Included", cents: included });
  }
  if (bonus > 0) {
    slices.push({ id: "bonus", label: "Bonus", cents: bonus });
  }
  if (onDemandCents > 0) {
    slices.push({ id: "on-demand", label: "On-demand", cents: onDemandCents });
  }
  return slices;
}

function buildModels(
  agg: AggregatedUsageResponse | undefined,
  autoBucketModels: string[] | undefined
): ModelRow[] {
  const rows = agg?.aggregations;
  if (!rows?.length) {
    return [];
  }

  const autoSet = new Set((autoBucketModels || []).map((m) => m.toLowerCase()));
  const mapped = rows
    .map((row) => {
      const cents = asNumber(row.totalCents) ?? 0;
      const input = asNumber(row.inputTokens) ?? 0;
      const output = asNumber(row.outputTokens) ?? 0;
      const cacheRead = asNumber(row.cacheReadTokens) ?? 0;
      const cacheWrite = asNumber(row.cacheWriteTokens) ?? 0;
      const billableTokens = input + output;
      const dollarsPerMillionTokens =
        billableTokens > 0 ? cents / 100 / (billableTokens / 1_000_000) : null;
      const model = row.modelIntent || "unknown";
      return {
        model,
        cents,
        sharePct: 0,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        dollarsPerMillionTokens,
        tier: row.tier,
        isAutoBucket: autoSet.has(model.toLowerCase()),
      };
    })
    .filter((r) => r.cents > 0 || r.inputTokens > 0 || r.outputTokens > 0)
    .sort((a, b) => b.cents - a.cents);

  const totalCents =
    asNumber(agg?.totalCostCents) ?? mapped.reduce((sum, row) => sum + row.cents, 0);
  const scale = Math.max(totalCents, 1);
  for (const row of mapped) {
    row.sharePct = (row.cents / scale) * 100;
  }
  return mapped;
}

function uniqueMessages(...candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of candidates) {
    const text = m?.trim();
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(text);
  }
  return out;
}

async function fetchPeriodUsage(token: string): Promise<PeriodUsageResponse | undefined> {
  const result = await getJson(
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
    {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: "{}",
    }
  );
  if (!result.ok) {
    return undefined;
  }
  return result.json as PeriodUsageResponse;
}

async function fetchPlanInfo(
  token: string
): Promise<{ planName?: string; price?: string; includedAmountCents?: number } | undefined> {
  const result = await getJson("https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo", {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: "{}",
  });
  if (!result.ok || !result.json || typeof result.json !== "object") {
    return undefined;
  }
  const planInfo = (result.json as { planInfo?: Record<string, unknown> }).planInfo;
  if (!planInfo) {
    return undefined;
  }
  return {
    planName: typeof planInfo.planName === "string" ? planInfo.planName : undefined,
    price: typeof planInfo.price === "string" ? planInfo.price : undefined,
    includedAmountCents: asNumber(planInfo.includedAmountCents),
  };
}

async function fetchUsageSummary(
  token: string,
  cookie: string | undefined
): Promise<Record<string, unknown> | undefined> {
  if (!cookie) {
    return undefined;
  }
  const result = await getJson("https://cursor.com/api/usage-summary", {
    method: "GET",
    headers: {
      ...authHeaders(token, cookie),
      Origin: "https://cursor.com",
    },
  });
  if (!result.ok) {
    return undefined;
  }
  return result.json as Record<string, unknown>;
}

async function fetchAggregatedUsage(
  token: string,
  startMs?: number,
  endMs?: number
): Promise<AggregatedUsageResponse | undefined> {
  const body = {
    startDate: startMs ?? Date.now() - 32 * 86400000,
    endDate: endMs ?? Date.now(),
  };
  const result = await getJson(
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetAggregatedUsageEvents",
    {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: JSON.stringify(body),
    }
  );
  if (!result.ok) {
    return undefined;
  }
  return result.json as AggregatedUsageResponse;
}

export async function fetchDashboardUsage(
  token: string | undefined,
  forceDemo = false
): Promise<UsageDashboardData> {
  if (forceDemo || !token) {
    return demoData(!token ? "No Cursor access token found in state.vscdb." : undefined);
  }

  const notes: string[] = [];
  const cookie = workosSessionCookie(token);
  if (!cookie) {
    notes.push("Could not build WorkosCursorSessionToken cookie from JWT (web APIs limited).");
  }

  let periodUsage: PeriodUsageResponse | undefined;
  let summary: Record<string, unknown> | undefined;
  let planInfo: Awaited<ReturnType<typeof fetchPlanInfo>>;
  let aggregations: AggregatedUsageResponse | undefined;

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
    planInfo = await fetchPlanInfo(token);
  } catch {
    planInfo = undefined;
  }

  try {
    summary = await fetchUsageSummary(token, cookie);
    if (!summary) {
      notes.push("usage-summary unavailable.");
    }
  } catch {
    notes.push("usage-summary request failed.");
  }

  const startMs =
    toEpochMs(periodUsage?.billingCycleStart) ??
    toEpochMs(summary?.billingCycleStart) ??
    Date.now() - 32 * 86400000;
  const endMs =
    toEpochMs(periodUsage?.billingCycleEnd) ??
    toEpochMs(summary?.billingCycleEnd) ??
    Date.now() + 86400000;

  try {
    aggregations = await fetchAggregatedUsage(token, startMs, Date.now());
    if (!aggregations?.aggregations?.length) {
      notes.push("GetAggregatedUsageEvents returned no per-model rows.");
    }
  } catch (err) {
    notes.push(
      `GetAggregatedUsageEvents error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const autoBucketModels = Array.isArray(periodUsage?.autoBucketModels)
    ? periodUsage!.autoBucketModels!.filter((m): m is string => typeof m === "string")
    : undefined;

  const pools = buildPools(periodUsage, summary);
  const composition = buildComposition(periodUsage, summary);
  const models = buildModels(aggregations, autoBucketModels);

  if (pools.length === 0 && models.length === 0 && composition.length === 0) {
    return demoData("Live APIs responded but no usage data was found.");
  }

  const now = Date.now();
  const daysElapsed = Math.max(1, Math.floor((now - startMs) / 86400000) + 1);
  const daysRemaining = Math.max(0, Math.ceil((endMs - now) / 86400000));

  const includedLimit =
    asNumber(periodUsage?.planUsage?.limit) ??
    asNumber(
      (summary?.individualUsage as { plan?: { limit?: number } } | undefined)?.plan?.limit
    ) ??
    planInfo?.includedAmountCents;
  const includedUsed =
    asNumber(periodUsage?.planUsage?.includedSpend) ??
    asNumber((summary?.individualUsage as { plan?: { used?: number } } | undefined)?.plan?.used) ??
    0;
  const totalSpend =
    asNumber(aggregations?.totalCostCents) ??
    asNumber(periodUsage?.planUsage?.totalSpend) ??
    composition.reduce((s, c) => s + c.cents, 0);

  // Prefer the specific Auto/API messages; keep the generic limit line if present.
  const messages = uniqueMessages(
    periodUsage?.autoModelSelectedDisplayMessage ||
      (typeof summary?.autoModelSelectedDisplayMessage === "string"
        ? summary.autoModelSelectedDisplayMessage
        : undefined),
    periodUsage?.namedModelSelectedDisplayMessage ||
      (typeof summary?.namedModelSelectedDisplayMessage === "string"
        ? summary.namedModelSelectedDisplayMessage
        : undefined),
    periodUsage?.displayMessage
  );

  const planName =
    planInfo?.planName ||
    (typeof summary?.membershipType === "string" &&
      String(summary.membershipType).replace(/^\w/, (c) => c.toUpperCase())) ||
    undefined;

  return {
    source: "live",
    planName,
    planPrice: planInfo?.price,
    billingCycleStart: formatDate(startMs) || formatDate(summary?.billingCycleStart),
    billingCycleEnd: formatDate(endMs) || formatDate(summary?.billingCycleEnd),
    daysElapsed,
    daysRemaining,
    messages: messages.length ? messages : undefined,
    pools,
    composition,
    models,
    autoBucketModels,
    burn:
      includedLimit !== undefined
        ? {
            spendPerDayCents: totalSpend / daysElapsed,
            includedLimitCents: includedLimit,
            includedUsedCents: includedUsed,
            includedRemainingCents: Math.max(0, includedLimit - includedUsed),
          }
        : undefined,
    totals: {
      totalCostCents: totalSpend,
      includedSpendCents: asNumber(periodUsage?.planUsage?.includedSpend),
      bonusSpendCents: asNumber(periodUsage?.planUsage?.bonusSpend),
      onDemandCents: composition.find((s) => s.id === "on-demand")?.cents,
      totalInputTokens: asNumber(aggregations?.totalInputTokens),
      totalOutputTokens: asNumber(aggregations?.totalOutputTokens),
      totalCacheReadTokens: asNumber(aggregations?.totalCacheReadTokens),
      totalCacheWriteTokens: asNumber(aggregations?.totalCacheWriteTokens),
    },
    fetchedAt: new Date().toISOString(),
    notes: notes.length ? notes : undefined,
  };
}
