const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeLesson(input, existing = {}) {
  const title = String(input.title || "").trim();
  if (!title) {
    const error = new Error("Title is required");
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const examples = Array.isArray(input.examples)
    ? input.examples
        .map(item => ({
          phrase: String(item.phrase || "").trim(),
          explanation: String(item.explanation || "").trim()
        }))
        .filter(item => item.phrase || item.explanation)
    : [];
  const questions = Array.isArray(input.questions)
    ? input.questions
        .map(item => ({
          prompt: String(item.prompt || "").trim(),
          answer: String(item.answer || "").trim()
        }))
        .filter(item => item.prompt || item.answer)
    : [];

  return {
    id: existing.id || crypto.randomUUID(),
    title,
    category: String(input.category || "").trim(),
    content: String(input.content || "").trim(),
    examples,
    questions,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function getLessonPreview(lesson) {
  const plainContent = lesson.content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    ...lesson,
    preview: plainContent.slice(0, 150)
  };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];

  if (req.method === "GET" && url.pathname === "/api/lessons") {
    const lessons = await db.getAllLessons();
    const query = (url.searchParams.get("q") || "").toLowerCase().trim();
    const filtered = query
      ? lessons.filter(lesson =>
          `${lesson.title} ${lesson.category}`.toLowerCase().includes(query)
        )
      : lessons;

    sendJson(res, 200, filtered.map(getLessonPreview));
    return;
  }

  if (req.method === "GET" && id) {
    const lesson = await db.getLessonById(id);
    if (!lesson) {
      sendJson(res, 404, { message: "Lesson not found" });
      return;
    }
    sendJson(res, 200, lesson);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/lessons") {
    const body = await parseBody(req);
    const lesson = normalizeLesson(body);
    await db.createLesson(lesson);
    sendJson(res, 201, lesson);
    return;
  }

  if (req.method === "PUT" && id) {
    const body = await parseBody(req);
    const existing = await db.getLessonById(id);
    if (!existing) {
      sendJson(res, 404, { message: "Lesson not found" });
      return;
    }
    const lesson = normalizeLesson(body, existing);
    await db.updateLesson(id, lesson);
    sendJson(res, 200, lesson);
    return;
  }

  if (req.method === "DELETE" && id) {
    const deleted = await db.deleteLesson(id);
    if (!deleted) {
      sendJson(res, 404, { message: "Lesson not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 405, { message: "Method not allowed" });
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    if (url.pathname.startsWith("/api/lessons")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.status || 500, { message: error.message || "Server error" });
  }
});

db.initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`English Grammar Learning System running at http://localhost:${PORT}`);
  });
});
