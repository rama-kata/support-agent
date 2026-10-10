import { Fragment, type ReactNode } from "react";

/** Minimal formatting for agent replies: paragraphs, "-" bullet lists and **bold**.
 * Everything is rendered as React text, so model output can't inject markup. */
export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-gold" />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
