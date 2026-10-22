---
name: Game Center scope
description: User's launcher hierarchy and local-only game requirements.
---

Game Center must be the only entry in the app launcher's root menu. It opens a submenu with a back arrow to return to the root menu; individual games do not belong at the root.

**Why:** The user explicitly requested this hierarchy instead of separate root-level game launchers.

**How to apply:** Keep this hierarchy when adding future games or changing the launcher. Do not restore the previous root app/file entries without checking with the user.

The initial card rules are Klondike, Spider, and FreeCell. Chess and Reversi must support both local two-player play and computer opponents, with no game server.

**Why:** The user chose these games and both opponent modes, and the site is intended to remain statically published.

**How to apply:** Keep gameplay and computer opponents browser-local when extending the games.
