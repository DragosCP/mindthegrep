#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);

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
    const pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
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
  console.log(`DraftKit demo: http://localhost:${port}/examples/bulk-tagging/`);
});
