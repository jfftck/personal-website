import { verifyToken } from "@clerk/backend";
import type { RequestHandler } from "express";

export const requireClerkUser: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!secretKey) {
    res.status(500).json({ error: "Authentication is not configured." });
    return;
  }

  try {
    await verifyToken(token, { secretKey });
    next();
  } catch {
    res.status(401).json({ error: "The sign-in session is invalid or expired." });
  }
};
