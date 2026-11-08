---
name: Native browser components
description: Project preference for browser-native UI primitives and web components over framework runtimes.
---

Prefer built-in browser capabilities and native custom elements for shared UI, using Shadow DOM where component CSS isolation is needed. Add a JavaScript UI framework only when it provides clear value beyond what the platform already supplies.

**Why:** The user does not want large amounts of JavaScript to reproduce browser-native capabilities; React's component isolation is implemented in JavaScript, while CSS encapsulation is provided by Shadow DOM.

**How to apply:** When adding or refactoring shared controls, prefer native elements, custom elements, and browser APIs first. Evaluate framework migration separately for existing apps and preserve their behavior and accessibility.
