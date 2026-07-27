import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";

let sqlPromise: Promise<SqlJsStatic> | undefined;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs();
  }
  return sqlPromise as Promise<SqlJsStatic>;
}

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

    const winUser = process.env.WSL_DISTRO_NAME
      ? detectWindowsUsername()
      : undefined;
    const usersRoot = "/mnt/c/Users";
    if (fs.existsSync(usersRoot)) {
      const users = winUser
        ? [winUser]
        : fs.readdirSync(usersRoot).filter((u) => !["Public", "Default", "Default User", "All Users"].includes(u));
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

  // Prefer environment hints
  const envUser = process.env.WINDOWS_USERNAME || process.env.WINUSER;
  if (envUser) {
    return envUser;
  }

  // Common: WSL home mirrors Windows user folder name under /mnt/c/Users
  try {
    const users = fs.readdirSync("/mnt/c/Users");
    // Prefer directories that look like real profiles with Cursor installed
    for (const user of users) {
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

function extractTokenFromValue(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  // Direct JWT / opaque token
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("eyJ") && trimmed.length > 40) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const keys = [
      "accessToken",
      "token",
      "access_token",
      "cursorAuth/accessToken",
      "cachedAccessToken",
    ];
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 20) {
        return value;
      }
    }
  } catch {
    // not JSON
  }

  // Key-value dump strings sometimes stored as text
  const match =
    trimmed.match(/accessToken["\s:=]+([A-Za-z0-9._\-]+)/i) ||
    trimmed.match(/WorkosCursorSessionToken["\s:=]+([^\s"']+)/i);
  if (match?.[1]) {
    return match[1];
  }

  return undefined;
}

function queryToken(db: Database): string | undefined {
  const keyCandidates = [
    "cursorAuth/accessToken",
    "cursorAuth/cachedAccessToken",
    "cursorAuth/authAccessToken",
    "cursorAuth/refreshToken",
    "secret://{" /* unlikely */,
  ].filter((k) => !k.includes("secret://"));

  // Prefer ItemTable key lookups
  for (const key of keyCandidates) {
    try {
      const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
      stmt.bind([key]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as { value?: string | Uint8Array };
        stmt.free();
        const value =
          typeof row.value === "string"
            ? row.value
            : row.value
              ? Buffer.from(row.value).toString("utf8")
              : "";
        const token = extractTokenFromValue(value);
        if (token && key !== "cursorAuth/refreshToken") {
          return token;
        }
      } else {
        stmt.free();
      }
    } catch {
      // continue
    }
  }

  // Broader scan for keys containing cursorAuth / accessToken
  try {
    const res = db.exec(
      "SELECT key, value FROM ItemTable WHERE key LIKE '%cursorAuth%' OR key LIKE '%accessToken%' LIMIT 50"
    );
    if (res[0]) {
      for (const row of res[0].values) {
        const key = String(row[0] ?? "");
        const value = row[1];
        const text =
          typeof value === "string"
            ? value
            : value instanceof Uint8Array
              ? Buffer.from(value).toString("utf8")
              : String(value ?? "");
        if (/refresh/i.test(key)) {
          continue;
        }
        const token = extractTokenFromValue(text);
        if (token) {
          return token;
        }
      }
    }
  } catch {
    // ignore
  }

  // cursorDiskKV table used by some Cursor builds
  try {
    const res = db.exec(
      "SELECT key, value FROM cursorDiskKV WHERE key LIKE '%accessToken%' OR key LIKE '%cursorAuth%' LIMIT 50"
    );
    if (res[0]) {
      for (const row of res[0].values) {
        const value = row[1];
        const text =
          typeof value === "string"
            ? value
            : value instanceof Uint8Array
              ? Buffer.from(value).toString("utf8")
              : String(value ?? "");
        const token = extractTokenFromValue(text);
        if (token) {
          return token;
        }
      }
    }
  } catch {
    // table may not exist
  }

  return undefined;
}

export async function getCursorAccessToken(): Promise<string | undefined> {
  const SQL = await getSql();
  const candidates = candidateStateDbPaths().filter((p) => fs.existsSync(p));

  for (const dbPath of candidates) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      const db = new SQL.Database(fileBuffer);
      try {
        const token = queryToken(db);
        if (token) {
          return token;
        }
      } finally {
        db.close();
      }
    } catch {
      // try next candidate
    }
  }

  return undefined;
}

