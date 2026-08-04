/**
 * Shared front door for the four import dialogs.
 *
 * Every parser in this app runs on the main thread and walks its input a
 * character at a time. `await file.text()` on a picked file has no ceiling, so
 * a mis-selected video or a bloated Takeout archive reads the whole thing into
 * memory and then freezes the tab for as long as the parse takes. Refuse
 * oversized input up front with a message the user can act on.
 */

/** Comfortably above a decade of chat history; far below anything that hurts. */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;

/** Pasted text is typed or clipboard-pasted, so it gets a much tighter cap. */
export const MAX_PASTE_CHARS = 4 * 1024 * 1024;

export class ImportTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(
      `That file is larger than ${Math.round(limitBytes / (1024 * 1024))} MB. ` +
        `Export a narrower date range and try again.`,
    );
    this.name = "ImportTooLargeError";
  }
}

/** Read a picked file as text, refusing anything over the size ceiling. */
export async function readImportFile(file: File, limit = MAX_IMPORT_BYTES): Promise<string> {
  if (file.size > limit) throw new ImportTooLargeError(limit);
  const text = await file.text();
  // A file can decode to more characters than it has bytes; check again.
  if (text.length > limit) throw new ImportTooLargeError(limit);
  return text;
}

/** Trim pasted text down to the ceiling rather than rejecting the paste. */
export function boundPaste(text: string, limit = MAX_PASTE_CHARS): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

export function importErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ImportTooLargeError ? error.message : fallback;
}
