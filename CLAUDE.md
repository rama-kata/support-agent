# cellar support agent: project rules

The brand is **cellar** (one word, lowercase in the wordmark). The store was previously "Cellar & Co."; prose may still say "Cellar".

## Design (web/)

- **Two colors only: ink `#16181B` and white `#FFFFFF`.** Every other value is a tint of the two, defined in `web/src/app/tokens.css`. No accent hue, no status colors, no gradients, no shadows.
- **Always white.** No dark mode and no theme toggle: the demo looks the same for every visitor, whatever their system setting. Cards on white are set apart by a 1px border, not a fill.
- **Colors come from `tokens.css` only.** Never put raw HEX, rgb() or hsl() values in components; use the Tailwind utilities mapped in `globals.css`. Exception: the `themeColor` meta in `layout.tsx`, which browsers read as literals.
- **State is shown by shape, icon and words, never by hue**: dashed outline for "waiting" or warnings, filled for done or primary, outline for secondary, strikethrough for cancelled.
- **Filled means primary.** Only the customer's messages and the one main action at a time are filled. Other buttons are outlines; agent replies are plain text.
- **Logo:** the `Logo` component in `components/ui/brand.tsx`, "cellar" with the double l drawn as two bottles, one full and one empty. `Bottles` is the icon form.
- **Typography:** Bricolage Grotesque for display and headings, Instrument Sans for body and chat, JetBrains Mono for order IDs, tracking numbers and data.
- **Chat layout: Margin Notes.** Agent replies read as plain text; the evidence for each reply (tool steps and results) sits in the margin beside it on desktop and inline above it on phones.
- 1px borders define cards. Interactive edges use the `line-strong` token (3:1); `line` is for decorative edges.
- Body text at least 16px on phones (iOS zooms into smaller inputs), no text below 12px, touch targets at least 44px on touch screens (`pointer-coarse:`).
- Check contrast (4.5:1 text, 3:1 UI boundaries) when adding or changing a tint.

## Agent tone

- Speaks like an experienced sommelier with white-glove support manners: direct, polite and knowledgeable, never stuffy or verbose.
- **Expertise must be grounded.** Storage, climate, humidity and serving advice comes only from `src/support_agent/kb/policies.md`. The agent has no data on vintages, tasting notes or producers beyond product names; it must say so rather than invent them. The feedback-loop eval found most "correct" v1 answers were invented, and the no-invention rule exists for that reason.
- Any prompt or persona change must be followed by a re-run of `evals/run_agent_eval.py`, with the result recorded in the README.

## Engineering

- Commits use the GitHub noreply email set in this repo's git config, never a personal address.
- Keep README numbers backed by eval runs; when a result changes, update the README in the same commit.
