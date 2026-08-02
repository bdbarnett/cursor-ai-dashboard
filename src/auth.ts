import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ACCESS_TOKEN_KEYS = [
  "cursorAuth/accessToken",
  "cursorAuth/cachedAccessToken",
  "cursorAuth/authAccessToken",
];

/** Candidate state.vscdb paths for Cursor on Windows and WSL. */
export function candidateStateDbPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    paths.push(path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"));
  } else if (platform === "darwin") {
    paths.push(
      path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")
    );
  } else {
    // Linux / WSL: native Linux Cursor, plus Windows Cursor via /mnt/c
    paths.push(path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb"));

    const usersRoot = "/mnt/c/Users";
    if (fs.existsSync(usersRoot)) {
      const winUser = detectWindowsUsername();
      const users = winUser
        ? [winUser]
        : fs
            .readdirSync(usersRoot)
            .filter((u) => !["Public", "Default", "Default User", "All Users", "desktop.ini"].includes(u));
      for (const user of users) {
        paths.push(
          path.join(
            usersRoot,
            user,
            "AppData",
            "Roaming",
            "Cursor",
            "User",
            "globalStorage",
            "state.vscdb"
          )
        );
      }
    }
  }

  return paths;
}

function detectWindowsUsername(): string | undefined {
  try {
    const cmd = fs.readFileSync("/proc/version", "utf8");
    if (!/microsoft|wsl/i.test(cmd) && !process.env.WSL_DISTRO_NAME) {
      return undefined;
    }
  } catch {
    // ignore
  }

  const envUser = process.env.WINDOWS_USERNAME || process.env.WINUSER;
  if (envUser) {
    return envUser;
  }

  try {
    const users = fs.readdirSync("/mnt/c/Users");
    for (const user of users) {
      if (["Public", "Default", "Default User", "All Users", "desktop.ini"].includes(user)) {
        continue;
      }
      const db = path.join(
        "/mnt/c/Users",
        user,
        "AppData",
        "Roaming",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      );
      if (fs.existsSync(db)) {
        return user;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function which(cmd: string): string | undefined {
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", [cmd], {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return out;
  } catch {
    return undefined;
  }
}

function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  try {
    return /microsoft|wsl/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function isWindowsPython(python: string): boolean {
  const p = python.toLowerCase();
  return p.endsWith(".exe") || p.includes("/mnt/c/") || /^[a-z]:\\/.test(python);
}

/** Prefer Windows Python when reading Cursor's Windows state DB from WSL. */
function resolveSqlitePython(dbPath: string): string {
  const needsWindows =
    process.platform === "win32" || dbPath.startsWith("/mnt/") || /^[a-zA-Z]:[\\/]/.test(dbPath);

  if (needsWindows && (process.platform === "win32" || isWsl())) {
    const candidates = [
      which("python.exe"),
      path.join(os.homedir(), "bin", "python.exe"),
      "/mnt/c/Windows/py.exe",
    ].filter(Boolean) as string[];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
  }

  return which("python3") || which("python") || "python3";
}

function toPythonDbPath(python: string, dbPath: string): string {
  if (!isWindowsPython(python)) {
    return dbPath;
  }
  if (/^[a-zA-Z]:[\\/]/.test(dbPath) || dbPath.startsWith("\\\\")) {
    return dbPath;
  }
  try {
    const win = execFileSync("wslpath", ["-w", dbPath], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    if (win) {
      return win;
    }
  } catch {
    // fall through
  }
  const m = dbPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
  }
  return dbPath;
}

function extractTokenFromValue(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("eyJ") && trimmed.length > 40) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const keys = ["accessToken", "token", "access_token", "cursorAuth/accessToken", "cachedAccessToken"];
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 20) {
        return value;
      }
    }
  } catch {
    // not JSON
  }

  const match =
    trimmed.match(/accessToken["\s:=]+([A-Za-z0-9._\-]+)/i) ||
    trimmed.match(/WorkosCursorSessionToken["\s:=]+([^\s"']+)/i);
  if (match?.[1]) {
    return match[1];
  }

  return undefined;
}

/**
 * Query state.vscdb via Python's sqlite3.
 *
 * Cursor's DB can be multi-GB (agent history in cursorDiskKV). sql.js loads the
 * whole file into memory and fails above 2 GiB. WSL mounts of the Windows DB also
 * hit disk I/O errors with native Linux sqlite — Windows python.exe works.
 */
function queryTokenViaPython(dbPath: string): string | undefined {
  const python = resolveSqlitePython(dbPath);
  const winDb = toPythonDbPath(python, dbPath);
  const keysJson = JSON.stringify(ACCESS_TOKEN_KEYS);

  // Keep the helper self-contained: print the first matching token value, or exit 2.
  const script = `
import json, sqlite3, sys
db = sys.argv[1]
keys = json.loads(sys.argv[2])
uri = "file:" + db.replace("\\\\", "/") + "?mode=ro"
con = sqlite3.connect(uri, uri=True, timeout=30)
cur = con.cursor()
def as_text(v):
    if v is None:
        return ""
    if isinstance(v, bytes):
        return v.decode("utf-8", "ignore")
    return str(v)
for table in ("ItemTable", "cursorDiskKV"):
    try:
        for key in keys:
            cur.execute(f"SELECT value FROM {table} WHERE key = ?", (key,))
            row = cur.fetchone()
            if row and row[0]:
                text = as_text(row[0]).strip()
                if text:
                    sys.stdout.write(text)
                    raise SystemExit(0)
        cur.execute(
            f"SELECT key, value FROM {table} WHERE key LIKE '%cursorAuth%' OR key LIKE '%accessToken%' LIMIT 50"
        )
        for key, value in cur.fetchall():
            if key and "refresh" in str(key).lower():
                continue
            text = as_text(value).strip()
            if text:
                sys.stdout.write(text)
                raise SystemExit(0)
    except sqlite3.Error:
        continue
raise SystemExit(2)
`.trim();

  const result = execFileSync(python, ["-c", script, winDb, keysJson], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return extractTokenFromValue(result);
}

export async function getCursorAccessToken(): Promise<string | undefined> {
  const candidates = candidateStateDbPaths().filter((p) => fs.existsSync(p));
  if (candidates.length === 0) {
    throw new Error(
      "No Cursor state.vscdb found. Expected under AppData/Roaming/Cursor (Windows) or ~/.config/Cursor (Linux)."
    );
  }

  const errors: string[] = [];
  for (const dbPath of candidates) {
    try {
      const size = fs.statSync(dbPath).size;
      const token = queryTokenViaPython(dbPath);
      if (token) {
        return token;
      }
      errors.push(`${dbPath} (${formatBytes(size)}): opened, but no access token key found`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${dbPath}: ${message}`);
    }
  }

  throw new Error(
    `Could not read Cursor access token from state.vscdb.\n${errors.join("\n")}\n` +
      "On WSL, Windows python.exe is required to query the large Windows Cursor DB."
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) {
    return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  }
  if (n >= 1024 ** 2) {
    return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  }
  return `${n} bytes`;
}
