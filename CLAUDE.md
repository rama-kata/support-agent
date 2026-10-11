# Cellar & Co. support agent: project rules

The store is **Cellar & Co.** (not "Cellar & Company").

## Design (web/)

- **Dark only.** There is no light mode or theme toggle.
- **Colors come from `web/src/app/tokens.css`.** Never put raw HEX, rgb() or hsl() values in components; use the Tailwind utilities mapped to those tokens in `globals.css`. The one exception is the `themeColor` meta value in `layout.tsx`, which browsers read as a literal.
- **No generic AI gradients**: no purple, blue or neon green, and no glow or gradient backgrounds.
- **Burgundy (`--color-brand-primary`) is for filled surfaces only** (buttons, the customer's chat bubbles) with light text on top. On the dark background it is 1.4:1, invisible as text, icons, links or focus rings. Use gold (`--color-brand-secondary`) for accents, links, icons and focus.
- **Sharp boundaries.** 1px borders define cards; no floating or blurred shadows. Inputs and other interactive boundaries use `--color-border-strong` (3:1 against the background); `--color-border` is for decorative card edges.
- **Typography:** Playfair Display for headings, Inter for body and chat text, JetBrains Mono for IDs and code.
- Body text at least 16px on phones (iOS zooms into smaller inputs), no text below 12px, and touch targets at least 44px on touch screens (`pointer-coarse:`).
- Check contrast (4.5:1 for text, 3:1 for UI boundaries) when adding or changing a color.

## Agent tone

- Speaks like an experienced sommelier with white-glove support manners: direct, polite and knowledgeable, never stuffy or verbose.
- **Expertise must be grounded.** Storage, climate, humidity and serving advice comes only from `src/support_agent/kb/policies.md`. The agent has no data on vintages, tasting notes or producers beyond product names; it must say so rather than invent them. The feedback-loop eval found most "correct" v1 answers were invented, and the no-invention rule exists for that reason.
- Any prompt or persona change must be followed by a re-run of `evals/run_agent_eval.py`, with the result recorded in the README.

## Engineering

- Commits use the GitHub noreply email set in this repo's git config, never a personal address.
- Keep README numbers backed by eval runs; when a result changes, update the README in the same commit.
