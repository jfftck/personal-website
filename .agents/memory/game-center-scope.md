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

Keep card/piece appearance separate from board/playfield appearance. Put configuration and appearance choices in Settings dialogs. Minesweeper's Flag mode is an immediate-play exception: use a switch on the left toolbar where other games have Undo.

**Why:** The user requested independent card/playfield themes and Settings dialogs, then explicitly moved Flag mode back to the toolbar as a toggle.

**How to apply:** Follow this separation for future games and settings. Keep immediate play actions such as New game and Undo in the toolbar.

Minesweeper's revealed and untouched cells must be distinct. When untouched cells are light, make revealed cells darker. All games' Glass themes should be transparent with blur, darker edges, brighter centers, and borders lighter in dark appearance and darker in light appearance. Glass is not a high-contrast theme: formal contrast standards are optional, but colors must remain distinguishable.

**Why:** The user requested this treatment across games and explicitly approved Glass falling below formal contrast standards in favor of transparency.

**How to apply:** Preserve cell-state and side/suit distinctions in games and their previews, without making Glass opaque to satisfy numeric contrast targets. Keep artwork choices independent of material/color themes.
