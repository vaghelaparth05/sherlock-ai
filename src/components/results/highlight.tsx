/** Renders text where [[double-bracketed]] words are highlighted. */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/\[\[(.+?)\]\]/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-[rgba(245,166,35,0.22)] px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
