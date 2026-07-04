#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.DRAFTKIT_PREVIEW_HOST || "127.0.0.1";
const feature = process.env.DRAFTKIT_FEATURE;
const previewToken = process.env.DRAFTKIT_PREVIEW_TOKEN || null;
const sessionId = process.env.DRAFTKIT_SESSION_ID || null;

if (!feature) {
  console.error("DRAFTKIT_FEATURE is required for the preview server");
  process.exit(1);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/__draftkit/preview-identity") {
      if (!previewToken || request.headers["x-draftkit-preview-token"] !== previewToken) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ owner: "draftkit", sessionId, feature, cwd: root, pid: process.pid }));
      return;
    }

    const pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const draftHostMatch = pathname.match(/^\/draftkit\/([a-z0-9][a-z0-9-]*)(?:\/index\.html)?$/);
    if (draftHostMatch) {
      const feature = draftHostMatch[1];
      const specPath = join(root, ".draftspec", "features", `${feature}.json`);
      const spec = JSON.parse(await readFile(specPath, "utf8"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderDraftHost(feature, spec));
      return;
    }

    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(root, safePath);
    const content = await readFile(filePath);
    response.writeHead(200, { "content-type": mime[extname(filePath)] || "text/plain; charset=utf-8" });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "Not found" : error.message);
  }
}).listen(port, host, () => {
  console.log(`Preview: http://${formatHost(host)}:${port}${previewPath(feature)}`);
});

function formatHost(value) {
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function previewPath(feature) {
  return existsSync(join(root, "examples", feature, "index.html"))
    ? `/examples/${feature}/`
    : `/draftkit/${feature}/`;
}

function renderDraftHost(feature, spec) {
  const title = spec.title || titleFromFeature(feature);
  const uiItems = list(spec.ui, (item) => item.label || item.id);
  const stateItems = list(spec.states, (item) => item.label || item.id);
  const actionItems = list(spec.actions, (item) => actionLabel(item));
  const contractItems = list(spec.backendContracts, (item) => contractLabel(item));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1d2528;
        background: #f7f8f5;
      }
      .app-shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 220px 1fr;
      }
      .sidebar {
        background: #26352f;
        color: #f6faf7;
        padding: 20px;
      }
      .sidebar nav {
        margin-top: 28px;
        display: grid;
        gap: 8px;
      }
      .sidebar a {
        color: inherit;
        text-decoration: none;
        padding: 8px 0;
      }
      .workspace {
        padding: 24px;
      }
      .toolbar {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
      }
      p {
        color: #5a6460;
      }
      .status {
        display: inline-block;
        border: 1px solid #bfd4ca;
        background: #e4f0ea;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 13px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      section {
        background: #fff;
        border: 1px solid #dfe4e1;
        border-radius: 8px;
        padding: 14px;
      }
      h2 {
        margin: 0 0 10px;
        font-size: 16px;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li {
        margin: 6px 0;
      }
    </style>
  </head>
  <body>
    <main class="app-shell">
      <aside class="sidebar">
        <strong>Mind the Grep</strong>
        <nav>
          <a aria-current="page">Workflow</a>
          <a>Tasks</a>
          <a>Review</a>
        </nav>
      </aside>
      <section class="workspace">
        <header class="toolbar">
          <div>
            <h1>${escapeHtml(title)}</h1>
            <p>Review the current workflow shape before it moves into the live product.</p>
          </div>
          <span class="status">${statusLabel(spec.status)}</span>
        </header>
        <div class="grid">
          <section>
            <h2>Places</h2>
            ${uiItems}
          </section>
          <section>
            <h2>Moments</h2>
            ${stateItems}
          </section>
          <section>
            <h2>Actions</h2>
            ${actionItems}
          </section>
          <section>
            <h2>Follow-through</h2>
            ${contractItems}
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function list(items, renderItem) {
  if (!Array.isArray(items) || items.length === 0) return "<p>None recorded yet.</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(renderItem(item))}</li>`).join("")}</ul>`;
}

function actionLabel(item) {
  if (item.label) return item.label;
  if (item.event && item.to) return `${titleFromFeature(item.event.replaceAll(".", "-"))} to ${titleFromFeature(item.to)}`;
  return item.id || "Action";
}

function contractLabel(item) {
  if (item.label) return item.label;
  if (item.current === "deferred" || item.status === "deferred" || item.mode === "deferred") {
    return "Needs live follow-through later";
  }
  return item.id ? titleFromFeature(item.id.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)) : "Follow-through";
}

function statusLabel(status) {
  return status === "approved" ? "Approved" : "In review";
}

function titleFromFeature(feature) {
  return feature
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
