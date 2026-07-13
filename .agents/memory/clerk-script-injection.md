---
name: Clerk script injection data-attribute
description: clerk.browser.js requires data-clerk-publishable-key on its script tag at load time; setting it after or via clerk.load() alone throws "Missing publishableKey".
---

# Clerk Script Tag — data-clerk-publishable-key Required at Load Time

## Rule
When injecting `clerk.browser.js` dynamically, you **must** set the `data-clerk-publishable-key` attribute on the `<script>` element *before* appending it to the DOM.

```js
const s = document.createElement('script');
s.setAttribute('data-clerk-publishable-key', publishableKey);
s.src = '/clerk-js/clerk.browser.js';
document.head.appendChild(s);
```

**Why:** The bundle's IIFE runs synchronously at load time and does:
```js
window.Clerk || (window.Clerk = new Clerk(td, { proxyUrl, domain }))
```
where `td` comes from `document.querySelector('script[data-clerk-publishable-key]').dataset.clerkPublishableKey`. Without the attribute, `td` is undefined, the constructor throws `"Missing publishableKey"`, and `window.Clerk` is never set. Calling `clerk.load({ publishableKey })` afterwards has nothing to work with.

**How to apply:** Always set the data attribute *before* appending the script, regardless of how the PK is fetched (API call, hardcoded, env var, etc.).

---

## Clerk proxy from Replit server — ruled out

Go TLS fingerprint does NOT bypass Cloudflare's block. Test confirmed:
- Node.js: TLS handshake failure (active TLS alert 40 from Cloudflare)
- Go: TCP timeout (packets dropped before reaching Cloudflare)

Both are blocked at the Replit network infrastructure level, not at the TLS layer. A proxy on the Replit server cannot reach `clerk.*.clerk.accounts.dev`. The sign-in flow must use direct browser → Clerk connections.
