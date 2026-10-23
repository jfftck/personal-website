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

Card stack peeking must follow vertical finger movement on touchscreens; mouse users peek with the right button rather than ordinary hovering.

**Why:** The user requested sliding up and down through stack layers instead of remaining on the initially touched card, and right-click peeking for mice.

**How to apply:** Keep peeking temporary and separate from moves. From a touch peek, a half-card-width slide left or right starts dragging the currently peeked card or valid sequence; invalid stacks must not start dragging. Disable peeking once dragging begins, and restore the stack on release or cancellation.

Matrix rain must keep falling until every card has exited the board. Spiral cards fly outward, alternating a full clockwise rotation with a full counterclockwise rotation; either direction may come first.

**Why:** The user requested complete off-board exits rather than rain disappearing mid-fall or spirals finishing in the center.

**How to apply:** Complete the exit paths before showing the next-game screen, while preserving reduced-motion skipping.

The scrollable card playfield needs 2rem of padding on all four sides. Chess, Reversi, and Minesweeper must scale to fit their available game-window play space.

**Why:** The user requested all-sided padding rather than top-only padding, and fit-to-space boards for the other games.

**How to apply:** Size boards using the remaining width and height inside each window, not viewport dimensions. Preserve square cells, centered boards, and scaling across Minesweeper difficulties.

In Chess and Reversi, white pieces always have a dark 10%-opacity outline and black pieces a white 10%-opacity outline, regardless of the chosen piece theme.

**Why:** The user requested consistent, faint 10% outlines so both sides remain gently defined across piece styles.

**How to apply:** Keep the outline colors and opacity consistent across themes, Glass styles, and Settings previews.

At game end, keep the finished board visible through its celebration before showing the next-game screen. Minesweeper uses fireworks on a win and mine bursts on a loss; Chess and Reversi celebrate with piece animations. Computer opponents must let players choose White or Black, preserving each game's existing default.

**Why:** The user asked for clear end-of-game celebrations and color choice against the computer without changing the current default sides.

**How to apply:** Respect reduced-motion settings, clean up celebration overlays when a game is reset or closed, and keep the final board visible underneath.
