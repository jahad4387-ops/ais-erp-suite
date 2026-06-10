import { app, BrowserWindow, dialog } from "electron";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRuntimeApi } from "../services/api/src/server.mjs";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function resolveUserDataRoot() {
  const localAppData = process.env.LOCALAPPDATA || app.getPath("userData");
  return join(localAppData, "AIS-ERP-Suite");
}

const userDataRoot = resolveUserDataRoot();
app.setPath("userData", userDataRoot);

function toPrismaFileUrl(filePath) {
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function configureDesktopEnvironment() {
  mkdirSync(userDataRoot, { recursive: true });
  mkdirSync(join(userDataRoot, "attachments"), { recursive: true });

  process.env.AIS_DEPLOYMENT_MODE = process.env.AIS_DEPLOYMENT_MODE || "local";
  process.env.AIS_PLATFORM_STORE = "prisma";
  process.env.DATABASE_URL = process.env.DATABASE_URL || toPrismaFileUrl(join(userDataRoot, "dev.db"));
  process.env.AIS_JWT_SECRET = process.env.AIS_JWT_SECRET || "local-desktop-secret-change-before-deploying";
  process.env.AIS_ATTACHMENT_STORAGE_PROVIDER = process.env.AIS_ATTACHMENT_STORAGE_PROVIDER || "local";
  process.env.AIS_ATTACHMENT_STORAGE_ROOT = process.env.AIS_ATTACHMENT_STORAGE_ROOT || join(userDataRoot, "attachments");
}

function readRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolveBody(null);
        return;
      }
      try {
        resolveBody(JSON.parse(text));
      } catch {
        reject(new Error("请求内容必须是有效 JSON。"));
      }
    });
  });
}

function extensionOf(filePath) {
  const index = filePath.lastIndexOf(".");
  return index >= 0 ? filePath.slice(index).toLowerCase() : "";
}

function staticFilePath(staticRoot, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(staticRoot, `.${normalizedPath}`);
  const rel = relative(staticRoot, candidate);
  if (rel.startsWith("..") || resolve(rel) === rel) {
    return join(staticRoot, "index.html");
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return join(staticRoot, "index.html");
}

async function handleApiRequest(api, request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  const apiPath = requestUrl.pathname.replace(/^\/api/, "") || "/";
  const result = await api.handle({
    method: request.method,
    path: `${apiPath}${requestUrl.search}`,
    headers: request.headers,
    body: await readRequestBody(request)
  });

  response.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(result.body));
}

function handleStaticRequest(staticRoot, request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  const filePath = staticFilePath(staticRoot, requestUrl.pathname);
  const contentType = MIME_TYPES.get(extensionOf(filePath)) || "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  response.end(readFileSync(filePath));
}

function createDesktopServer(api, staticRoot) {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (requestUrl.pathname.startsWith("/api")) {
        await handleApiRequest(api, request, response);
        return;
      }
      handleStaticRequest(staticRoot, request, response);
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          code: "DESKTOP_RUNTIME_ERROR",
          message: error.message || "桌面版运行时异常。",
          traceId: "desktop-runtime"
        })
      );
    }
  });
}

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address().port));
  });
}

function createWindow(port) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "AIS ERP 财务套件",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadURL(`http://127.0.0.1:${port}/`);
  return window;
}

let desktopServer = null;

async function start() {
  configureDesktopEnvironment();
  const staticRoot = join(app.getAppPath(), "apps", "web", "dist");
  if (!existsSync(join(staticRoot, "index.html"))) {
    throw new Error(`未找到前端构建文件：${pathToFileURL(staticRoot)}`);
  }

  const api = await createRuntimeApi(process.env);
  desktopServer = createDesktopServer(api, staticRoot);
  const port = await listen(desktopServer);
  createWindow(port);
}

app.whenReady().then(start).catch((error) => {
  dialog.showErrorBox("AIS ERP 财务套件启动失败", error.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  desktopServer?.close();
});
