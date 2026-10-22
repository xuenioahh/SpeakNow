import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const apiDir = path.join(projectRoot, "api");
const envFile = path.join(projectRoot, ".env");

function loadEnvFile() {
  if (!fs.existsSync(envFile)) {
    return;
  }

  const raw = fs.readFileSync(envFile, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const port = Number(process.env.BACKEND_PORT || 8787);
const host = process.env.BACKEND_HOST || "127.0.0.1";

function setCorsHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function createResponse(res) {
  return {
    setHeader(name, value) { res.setHeader(name, value); },
    get headersSent() { return res.headersSent; },
    get statusCode() { return res.statusCode; },
    set statusCode(code) { res.statusCode = code; },
    end(body) { res.end(body); },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(payload));
    },
  };
}

async function readJsonBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return {};
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    const limit = req.url?.startsWith('/api/presentation-media') ? 16 * 1024 * 1024 : 512 * 1024;
    if (bytes > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function resolveHandler(urlPathname) {
  const routeName = urlPathname.replace(/^\/api\//, "");
  if (!routeName || routeName.startsWith('_') || routeName.includes("/") || routeName.includes("\\")) {
    return null;
  }

  const filePath = path.join(apiDir, `${routeName}.js`);
  if (!fs.existsSync(filePath)) return null;
  const moduleUrl = pathToFileURL(filePath).href;
  const loaded = await import(moduleUrl);
  return loaded?.default || null;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (!requestUrl.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const handler = await resolveHandler(requestUrl.pathname);
    if (!handler) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "API route not found" }));
      return;
    }

    const body = await readJsonBody(req);
    const adaptedReq = {
      method: req.method,
      headers: req.headers,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body,
      url: req.url,
      socket: req.socket,
    };

    await handler(adaptedReq, createResponse(res));
  } catch (error) {
    const statusCode = error.status || (error?.message === "Invalid JSON body" ? 400 : 500);
    if (!res.headersSent) {
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: error?.message || "Internal server error" }));
  }
});

server.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});
