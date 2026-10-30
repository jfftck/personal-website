import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicContentRouter } from "./routes/content";
import { createRequire } from "node:module";

// Keep the legacy streaming/upload handler outside the bundle and before body
// parsers: it reads the original request stream itself.
const require = createRequire(import.meta.url);
const legacyHandle = require("../legacy/admin/server.js");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  if (
    req.path === "/api/healthz" ||
    req.path.startsWith("/api/content") ||
    req.path === "/files" ||
    req.path.startsWith("/files/")
  ) {
    return next();
  }
  if (
    (req.path === "/admin" ||
      req.path === "/admin/" ||
      req.path === "/admin/admin.html") &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    res.redirect(302, "/admin-console/");
    return;
  }
  if (
    /^\/(posts|documents|pictures|videos|welcome)(\/|$)/.test(req.path) &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    res.redirect(302, `/files${req.path}`);
    return;
  }
  if (
    req.path.startsWith("/api/manifest/") ||
    req.path.startsWith("/api/file/") ||
    req.path.startsWith("/api/upload/") ||
    req.path === "/api/welcome"
  ) {
    res.status(410).json({ error: "This content endpoint has been retired." });
    return;
  }
  Promise.resolve(legacyHandle(req, res)).catch(next);
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/files", publicContentRouter);
app.use("/api", router);
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) return next(error);
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    if (status >= 500) {
      req.log.error({ err: error }, "request failed");
      res.status(500).json({ error: "The content service could not complete this request." });
      return;
    }
    res.status(status).json({
      error: error instanceof Error ? error.message : "Request failed.",
    });
  },
);

export default app;
