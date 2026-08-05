import { Download } from "lucide-react";

/**
 * A link to a sample file for one importer.
 *
 * The importers only accept a real export from a real service, which is a lot
 * to ask of someone deciding whether the app is worth their evening. Each
 * sample is small, obviously fictional, and shaped like the export it stands
 * in for — including the awkward parts: a floating calendar time, an undated
 * viewing row, two identical messages a second apart. Those are the cases that
 * used to go wrong, so a sample that omitted them would demonstrate nothing.
 *
 * `download` rather than a plain link so the browser saves the file instead of
 * rendering it, which is what the file picker on the next line needs.
 */
export function SampleFileLink({ file, label }: { file: string; label: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      No export handy?{" "}
      <a
        href={`/samples/${file}`}
        download={file}
        className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
      >
        <Download className="size-3" aria-hidden />
        {label}
      </a>{" "}
      and pick it above to see how this works.
    </p>
  );
}
