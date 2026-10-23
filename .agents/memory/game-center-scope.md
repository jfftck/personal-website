---
name: Game Center scope
description: Launcher hierarchy, browser-local gameplay, and settings organization.
---

Keep the existing apps and document/picture entries in the app launcher's root menu, with Game Center as an additional root entry. Game Center opens a submenu with a back arrow to return to the root menu; individual games do not belong at the root.

**Why:** The user clarified that they wanted the games nested, not the old root entries removed.

**How to apply:** Preserve existing root entries when changing the launcher. Place future games inside Game Center rather than adding separate game entries at the root.

The initial card rules are Klondike, Spider, and FreeCell. Chess and Reversi must support both local two-player play and computer opponents, with no game server.

**Why:** The user chose these games and both opponent modes, and the site is intended to remain statically published.

**How to apply:** Keep gameplay and computer opponents browser-local when extending the games.

Keep card/piece appearance separate from board/playfield appearance. Put game configuration and appearance choices in each game's Settings dialog rather than adding option controls to the play toolbar.

**Why:** The user requested independent card and playfield themes and settings dialogs for all game options.

**How to apply:** Follow this separation for future games and settings. Keep immediate play actions such as New game and Undo in the toolbar.

Minesweeper's revealed and untouched cells must be strongly distinct. When untouched cells are light, make revealed cells darker. Glass cells should have darker edges, brighter centers, and borders that are lighter in dark appearance and darker in light appearance.

**Why:** The user requested stronger cell-state contrast and this Glass treatment.

**How to apply:** Preserve these distinctions when adding or changing Minesweeper themes, including their settings previews.
