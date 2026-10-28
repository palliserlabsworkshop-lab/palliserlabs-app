import type { ClientFile } from "@/lib/notion";

const SWATCHES = ["var(--brand-accent)", "var(--brand-primary)", "var(--brand-orange)", "var(--brand-yellow)"];

/** Picks a consistent brand colour per file type, so "PDF" is always the same colour. */
function swatchFor(type: string) {
  let hash = 0;
  for (const ch of type.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}

function FileIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 2.5h6.5L15.5 6.5v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M11.5 2.5v4h4" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 11l6-6M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FileList({ files }: { files: ClientFile[] }) {
  if (!files.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
        No documents have been shared yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {files.map((file) => {
        const color = swatchFor(file.type || "file");
        const body = (
          <>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${color} 14%, white)`, color }}
            >
              <FileIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9rem] font-bold text-foreground">{file.name}</span>
              <span className="mt-0.5 block text-[0.75rem] text-muted">{file.type || "File"}</span>
            </span>
          </>
        );

        return (
          <li key={file.id}>
            {file.hasLink ? (
              <a
                href={`/api/files/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-surface active:bg-surface"
              >
                {body}
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[0.75rem] font-bold text-foreground transition group-hover:border-primary group-hover:text-primary">
                  Open
                  <ArrowIcon />
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-3.5 px-4 py-3.5 opacity-60">
                {body}
                <span className="shrink-0 text-[0.75rem] text-muted">No link yet</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
