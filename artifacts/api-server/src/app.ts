import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicContentRouter } from "./routes/publicContent";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { authRateLimit } from "./middlewares/authRateLimit";

const app: Express = express();

// Replit serves the API through one reverse-proxy hop; trust that hop for client IPs.
app.set("trust proxy", 1);

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
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb", parameterLimit: 1000 }));

// Limit public OIDC endpoints before session lookups run.
app.get("/api/login", authRateLimit);
app.get("/api/callback", authRateLimit);

// Public file delivery stays unauthenticated and keeps the static-looking URL.
app.use("/files", publicContentRouter);
app.use("/api", authMiddleware, router);

app.use((req, res, next) => {
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
  if (/^\/api\/(manifest|file|upload)(\/|$)/.test(req.path) || /^\/api\/welcome\/?$/.test(req.path)) {
    res.status(410).json({ error: "This content endpoint has been retired." });
    return;
  }
  next();
});
app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});
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
