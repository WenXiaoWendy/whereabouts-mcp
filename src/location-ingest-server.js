const http = require("http");
const { URL } = require("url");

const MAX_BODY_BYTES = 64 * 1024;

function createLocationIngestServer({ store, token, onAccepted = null }) {
  const normalizedToken = String(token || "").trim();
  const acceptedCallback = typeof onAccepted === "function" ? onAccepted : null;
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/healthz") {
        writeJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/location/ingest") {
        const result = ingestLocationPayload({
          store,
          token: normalizedToken,
          authorization: req.headers.authorization,
          bodyText: await readRawBody(req),
          remoteAddress: extractRemoteAddress(req),
          userAgent: req.headers["user-agent"] || "",
        });
        if (acceptedCallback) {
          Promise.resolve(acceptedCallback(result)).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[whereabouts-mcp] location accept callback failed: ${message}`);
          });
        }
        writeJson(res, result.statusCode, result.body);
        return;
      }

      writeJson(res, 404, { error: "not_found" });
    } catch (error) {
      writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function startLocationIngestServer({ store, token, host, port, onAccepted }) {
  const server = createLocationIngestServer({ store, token, onAccepted });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

function ingestLocationPayload({ store, token, authorization, bodyText, remoteAddress = "", userAgent = "" }) {
  if (!isAuthorizedHeader(authorization, token)) {
    return { statusCode: 401, body: { error: "unauthorized" } };
  }
  if (!String(bodyText || "").trim()) {
    return { statusCode: 400, body: { error: "missing request body" } };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(String(bodyText));
  } catch {
    return { statusCode: 400, body: { error: "request body must be valid JSON" } };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { statusCode: 400, body: { error: "request body must be a JSON object" } };
  }

  const appended = store.append({
    ...parsed,
    timestamp: parsed.timestamp || parsed.capturedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    remoteAddress,
    userAgent,
  });
  const stored = appended.point;
  return {
    statusCode: 202,
    body: {
      ok: true,
      id: stored.id,
      timestamp: stored.timestamp,
      receivedAt: stored.receivedAt,
    },
    appended,
  };
}

function isAuthorizedHeader(authorization, token) {
  if (!token) {
    return false;
  }
  const header = String(authorization || "").trim();
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim() === token;
  }
  return false;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8").trim());
    });
    req.on("error", reject);
  });
}

function extractRemoteAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwardedFor) {
    return forwardedFor;
  }
  return String(req.socket?.remoteAddress || "").trim();
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body, "utf8"),
  });
  res.end(body);
}

module.exports = {
  createLocationIngestServer,
  ingestLocationPayload,
  startLocationIngestServer,
};
