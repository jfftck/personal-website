# Jeffrey M. Tackett — Personal Website

Personal website with a tiling desktop, document and media viewers, and browser games.

## Run & Operate

- Start the managed `artifacts/personal-website: web` and `artifacts/api-server: API Server` workflows to preview the site.
- `pnpm test` — original game and server unit tests
- `pnpm test:browser` — original browser regression tests (uses `REPLIT_DEV_DOMAIN` by default)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The existing website does not use the scaffold database. Content remains file-based.
- Existing admin authentication uses the external Clerk configuration; preserve it.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/personal-website/public/` — original browser-ready site, assets, manifests, and content
- `artifacts/personal-website/scripts/build-static.cjs` — copies the original static site without bundling or changing its URLs
- `artifacts/api-server/legacy/admin/` — preserved admin UI and request handler
- `artifacts/api-server/src/app.ts` — mounts the legacy handler before body parsers, preserving streaming uploads
- `tests/` — preserved regression tests with workspace-relative imports

## Architecture decisions

- Keep the existing vanilla website and custom API layer intact during migration; do not rewrite it to use scaffold React components or generated hooks.
- Mutable content URLs route to the same backend storage used by admin edits, including in production.
- The admin console remains at its original URL. Creating a separate Library app is separate work.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
