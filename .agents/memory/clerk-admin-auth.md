---
name: Clerk admin auth
description: How Clerk browser SDK is loaded in the admin app and why the Replit screenshot tool shows a spinner forever
---

# Clerk Admin Auth Setup

## Rule
The admin app serves `@clerk/clerk-js` locally from `node_modules` at `/clerk-js/*`. The webpack public-path auto-detect throws when `document.currentScript` is null (sandboxed iframes); server.js patches the bundle at serve time: replaces `if(!e)throw Error("Automatic publicPath...")` with `if(!e)e="/clerk-js/"`.

**Why:** Replit's preview iframe nullifies `currentScript`, breaking webpack's automatic public path detection. Serving chunks locally also avoids CSP issues.

## Rule
The Replit screenshot tool's headless browser (and the Replit server itself) cannot reach `clerk.*.clerk.accounts.dev` — Cloudflare blocks TLS from Replit server IPs (curl exit 35, TLS handshake failure). `clerk.load()` hangs forever in the screenshot tool's sandboxed context.

**Why:** This is a Replit sandbox network restriction, not a code bug. The user's real browser tab opening the `https://...-3001.replit.dev` URL can reach Clerk normally.

**How to apply:** Do not use the screenshot tool to verify Clerk auth flow — it will always show the loading spinner. The correct test is: API returns 401 without a token (curl test), HTML has the right hidden/visible elements, and clerk.browser.js + chunks serve 200.

## Key files
- `admin/server.js`: `requireAuth()` middleware, `/clerk-js/*` static route with public-path patch, `/clerk-proxy/*` proxy route (kept but unused — server also can't reach FAPI), `/api/clerk-config` returns publishable key
- `admin/admin.js`: `initClerk()` injects clerk-js script, waits for `onload`, then calls `clerk.load({ publishableKey })`
- `admin/admin.html`: `#loading-screen`, `#auth-screen`, `#tab-strip hidden`, `#main-area hidden` — all toggled by `showAuthScreen()`/`showAdminUI()`

## Verified working (curl)
- `GET /api/manifest/posts` → 401 (no token)
- `GET /api/manifest/posts` with invalid Bearer → 401
- `GET /api/clerk-config` → 200 `{ publishableKey }`
- `GET /clerk-js/clerk.browser.js` → 200 (patched)
- `GET /clerk-js/signin_clerk.browser_636222_5.127.0.js` → 200
