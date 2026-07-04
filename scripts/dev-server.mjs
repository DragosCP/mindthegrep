#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const feature = process.env.DRAFTKIT_FEATURE || "bulk-tagging";
const previewToken = process.env.DRAFTKIT_PREVIEW_TOKEN || null;
const sessionId = process.env.DRAFTKIT_SESSION_ID || null;

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
}).listen(port, () => {
  console.log(`DraftKit preview: http://localhost:${port}${previewPath(feature)}`);
});

function previewPath(feature) {
  return existsSync(join(root, "examples", feature, "index.html"))
    ? `/examples/${feature}/`
    : `/draftkit/${feature}/`;
}

function renderDraftHost(feature, spec) {
  const title = spec.title || titleFromFeature(feature);
  const uiItems = list(spec.ui, (item) => `${item.label || item.id} (${item.type || "ui"})`);
  const stateItems = list(spec.states, (item) => item.label || item.id);
  const actionItems = list(spec.actions, (item) => `${item.id}: ${item.event} -> ${item.to}`);
  const contractItems = list(spec.backendContracts, (item) => `${item.id}: ${item.method || "POST"} ${item.pathHint || item.operation}`);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} Draft</title>
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
      code {
        background: #eef2ef;
        border: 1px solid #d9e1dd;
        border-radius: 4px;
        padding: 1px 4px;
      }
    </style>
  </head>
  <body>
    <main class="app-shell">
      <aside class="sidebar">
        <strong>Mind the Grep</strong>
        <nav>
          <a aria-current="page">DraftKit</a>
          <a>Workflow</a>
          <a>Go-live</a>
        </nav>
      </aside>
      <section class="workspace">
        <header class="toolbar">
          <div>
            <h1>${escapeHtml(title)}</h1>
            <p>Generic DraftKit host for <code>${escapeHtml(feature)}</code>. It reflects the draft spec until a real app route exists.</p>
          </div>
          <span class="status">${escapeHtml(spec.status || "draft")}</span>
        </header>
        <div class="grid">
          <section>
            <h2>UI Locations</h2>
            ${uiItems}
          </section>
          <section>
            <h2>States</h2>
            ${stateItems}
          </section>
          <section>
            <h2>Actions</h2>
            ${actionItems}
          </section>
          <section>
            <h2>Backend Contracts</h2>
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
