import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
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
  if (req.path === "/api/healthz") return next();
  Promise.resolve(legacyHandle(req, res)).catch(next);
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
