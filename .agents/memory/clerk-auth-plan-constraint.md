---
name: Clerk plan constraint
description: The personal page should not require a plan change solely to enable Clerk production authentication.
---

Do not ask the user to change their plan just to enable Clerk production secret keys for this personal page. Prefer evaluating authentication options available on their current plan.

**Why:** The user said production secret keys would require a plan change they do not want for a personal page.

**How to apply:** Avoid recommending a plan upgrade as the fix; assess current-plan alternatives first and confirm before replacing the authentication provider.
