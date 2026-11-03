import type { RequestHandler } from "express";
import { isWorkspaceOwner } from "../lib/auth";

export const requireOwner: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!process.env.REPL_OWNER?.trim()) {
    req.log.error("Workspace owner is unavailable; private content access is disabled.");
    res.status(503).json({ error: "Owner access is not configured." });
    return;
  }

  if (!isWorkspaceOwner(req.user?.username)) {
    res.status(403).json({ error: "This account does not have access to the content library." });
    return;
  }

  next();
};
