import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

export const requireOwner: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  if (!process.env.REPL_OWNER?.trim()) {
    req.log.error("Workspace owner is unavailable; private content access is disabled.");
    res.status(503).json({ error: "Owner access is not configured." });
    return;
  }

  // Only previously admitted owner rows are eligible. A Clerk username is
  // user-editable, so it must never grant access or auto-provision an owner.
  // Migrated sessions carry the original subject in userId, not auth.userId.
  const userId = auth.sessionClaims?.userId;
  if (typeof userId !== "string" || !userId) {
    res.status(403).json({ error: "This account does not have access to the content library." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const owner = process.env.REPL_OWNER!.trim().toLowerCase();
  if (!user || user.username?.trim().toLowerCase() !== owner) {
    res.status(403).json({ error: "This account does not have access to the content library." });
    return;
  }

  req.dbUser = user;
  next();
};
