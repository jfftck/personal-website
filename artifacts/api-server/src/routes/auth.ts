import { db, usersTable } from "@workspace/db";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearSession,
  createSession,
  getOidcConfig,
  getSessionId,
  isWorkspaceOwner,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();
const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const DEFAULT_RETURN_TO = "/admin-console/";

function getOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol)
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "")
    .split(",")[0]
    .trim();
  if (!host || !["http", "https"].includes(proto)) {
    throw new Error("Unable to determine the public origin for authentication.");
  }
  return `${proto}://${host}`;
}

function setSecureCookie(res: Response, name: string, value: string, maxAge: number) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    (!value.startsWith("/admin-console/") && value !== "/admin-console") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return DEFAULT_RETURN_TO;
  }

  try {
    const parsed = new URL(value, "https://internal.invalid");
    if (
      parsed.origin !== "https://internal.invalid" ||
      (parsed.pathname !== "/admin-console" && !parsed.pathname.startsWith("/admin-console/"))
    ) {
      return DEFAULT_RETURN_TO;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

function getDeniedReturnTo(returnTo: string): string {
  const parsed = new URL(returnTo, "https://internal.invalid");
  parsed.searchParams.set("access", "denied");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function getStringClaim(
  claims: Record<string, unknown>,
  names: string[],
): string | null {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getUsernameClaim(claims: Record<string, unknown>): string | null {
  return getStringClaim(claims, ["preferred_username", "username", "replit_username"]);
}

async function upsertUser(claims: Record<string, unknown>) {
  const id = getStringClaim(claims, ["sub"]);
  if (!id) throw new Error("The identity provider did not return a subject.");

  const fullName = getStringClaim(claims, ["name"])?.split(/\s+/) ?? [];
  const userData = {
    id,
    username: getUsernameClaim(claims),
    email: getStringClaim(claims, ["email"]),
    firstName: getStringClaim(claims, ["first_name"]) ?? fullName[0] ?? null,
    lastName:
      getStringClaim(claims, ["last_name"]) ??
      (fullName.length > 1 ? fullName.slice(1).join(" ") : null),
    profileImageUrl: getStringClaim(claims, ["profile_image_url", "picture"]),
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { ...userData, updatedAt: new Date() },
    })
    .returning();
  return user;
}

function clearOidcCookies(res: Response) {
  for (const name of ["code_verifier", "nonce", "state", "return_to"]) {
    res.clearCookie(name, { path: "/" });
  }
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
      isOwner: req.isAuthenticated() && isWorkspaceOwner(req.user?.username),
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setSecureCookie(res, "code_verifier", codeVerifier, OIDC_COOKIE_TTL);
  setSecureCookie(res, "nonce", nonce, OIDC_COOKIE_TTL);
  setSecureCookie(res, "state", state, OIDC_COOKIE_TTL);
  setSecureCookie(res, "return_to", returnTo, OIDC_COOKIE_TTL);
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;
  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  if (!codeVerifier || !expectedState) {
    clearOidcCookies(res);
    res.redirect(`/api/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  const currentUrl = new URL(req.originalUrl, `${getOrigin(req)}/`);
  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    clearOidcCookies(res);
    res.redirect(`/api/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  clearOidcCookies(res);
  const claims = tokens.claims() as Record<string, unknown> | undefined;
  if (!claims || !isWorkspaceOwner(getUsernameClaim(claims))) {
    req.log.warn("Rejected a Replit Auth login that did not match the workspace owner.");
    res.redirect(getDeniedReturnTo(returnTo));
    return;
  }

  const dbUser = await upsertUser(claims);
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = tokens.expiresIn();
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresIn ? now + expiresIn : (claims.exp as number | undefined),
  };

  const sid = await createSession(sessionData);
  setSecureCookie(res, SESSION_COOKIE, sid, SESSION_TTL);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const origin = getOrigin(req);
  const sid = getSessionId(req);
  await clearSession(res, sid);

  try {
    const config = await getOidcConfig();
    const redirectUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: new URL(returnTo, `${origin}/`).href,
    });
    res.redirect(redirectUrl.href);
  } catch (error) {
    req.log.warn({ err: error }, "Identity provider logout failed; clearing the local session.");
    res.redirect(returnTo);
  }
});

export default router;
