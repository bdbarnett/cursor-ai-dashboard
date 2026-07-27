import * as vscode from "vscode";
import { getCursorAccessToken } from "./auth";
import { fetchDashboardUsage, UsageDashboardData } from "./api";
import { getDashboardHtml } from "./webview/dashboard";

let panel: vscode.WebviewPanel | undefined;
let lastData: UsageDashboardData | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("cursorAiDashboard.open", () => openDashboard(context)),
    vscode.commands.registerCommand("cursorAiDashboard.refresh", () => refreshDashboard(context))
  );
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}

async function openDashboard(context: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    await refreshDashboard(context);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "cursorAiDashboard",
    "Cursor AI Dashboard",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.onDidDispose(
    () => {
      panel = undefined;
    },
    null,
    context.subscriptions
  );

  panel.webview.onDidReceiveMessage(
    async (message) => {
      if (message?.type === "refresh") {
        await refreshDashboard(context);
      }
    },
    undefined,
    context.subscriptions
  );

  await refreshDashboard(context);
}

async function refreshDashboard(context: vscode.ExtensionContext): Promise<void> {
  if (!panel) {
    await openDashboard(context);
    return;
  }

  panel.webview.html = getDashboardHtml(lastData, { loading: true });

  try {
    const token = await getCursorAccessToken();
    lastData = await fetchDashboardUsage(token);
    panel.webview.html = getDashboardHtml(lastData, { loading: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastData = await fetchDashboardUsage(undefined, true);
    panel.webview.html = getDashboardHtml(lastData, {
      loading: false,
      error: message,
    });
  }
}
