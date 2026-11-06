import crypto from "node:crypto";
import type { AuthUser } from "@workspace/api-zod";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import * as oidc from "openid-client";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

// Verified deployment domains; update this allowlist when the published domains change.
const trustedPublishedHosts = new Set([
  "personal.jeffreytackett.us",
  "personal-jfftck.replit.app",
]);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

function getReplitDevelopmentHost(): string | null {
  const configuredDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (!configuredDomain) return null;

  try {
    const value = configuredDomain.includes("://")
      ? configuredDomain
      : `https://${configuredDomain}`;
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getTrustedAppOrigin(req: Request): string | null {
  const forwardedHost = req.get("x-forwarded-host");
  const forwardedProto = req.get("x-forwarded-proto");
  if (
    (forwardedHost && forwardedHost.includes(",")) ||
    (forwardedProto && forwardedProto.includes(","))
  ) {
    return null;
  }

  const host = (forwardedHost ?? req.get("host") ?? "").trim();
  const protocol = (forwardedProto ?? req.protocol).trim().toLowerCase();
  if (!host || host.length > 255 || /\s/.test(host)) return null;
  if (protocol !== "http" && protocol !== "https") return null;

  let parsed: URL;
  try {
    parsed = new URL(`${protocol}://${host}`);
  } catch {
    return null;
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const developmentHost = getReplitDevelopmentHost();
  const isNonProduction =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const isPublishedHost = trustedPublishedHosts.has(hostname);
  const isDevelopmentHost =
    isNonProduction && developmentHost !== null && hostname === developmentHost;
  const isLocalHost = process.env.NODE_ENV === "test" && localHosts.has(hostname);

  if ((isPublishedHost || isDevelopmentHost) && protocol === "https" && !parsed.port) {
    return parsed.origin;
  }
  if (isLocalHost && protocol === "http") {
    return parsed.origin;
  }
  return null;
}

let oidcConfig: oidc.Configuration | null = null;

export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!oidcConfig) {
    const clientId = process.env.REPL_ID;
    if (!clientId) throw new Error("Replit Auth requires the REPL_ID environment variable.");
    const issuer = new URL(ISSUER_URL);
    const testOnlyHttpDiscovery =
      process.env.NODE_ENV === "test" && issuer.protocol === "http:"
        ? { execute: [oidc.allowInsecureRequests] }
        : undefined;
    oidcConfig = await oidc.discovery(
      issuer,
      clientId,
      undefined,
      undefined,
      testOnlyHttpDiscovery,
    );
  }
  return oidcConfig;
}

export function isWorkspaceOwner(username: string | null | undefined): boolean {
  const owner = process.env.REPL_OWNER?.trim().toLowerCase();
  return Boolean(owner && username?.trim().toLowerCase() === owner);
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(sid: string, data: SessionData): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}
