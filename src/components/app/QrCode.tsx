import { useMemo } from "react";
// Deep import: the package entry point is CommonJS and pulls in the canvas
// and PNG renderers wholesale, none of which survive being tree-shaken. The
// encoder alone is all this component needs.
import { create as createQr } from "qrcode/lib/core/qrcode.js";

/** Quiet zone in modules, per the QR spec. */
const MARGIN = 2;

type Matrix = { size: number; path: string };

/**
 * Build one SVG path covering every dark module.
 *
 * Runs of adjacent dark modules in a row collapse into a single rectangle, so
 * a typical code is a few hundred path commands rather than ~1,500 elements.
 */
function toPath(modules: { size: number; data: Uint8Array | number[] }): string {
  const { size, data } = modules;
  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && data[row * size + col] === 1;
      if (dark && start === -1) start = col;
      if (!dark && start !== -1) {
        parts.push(`M${start + MARGIN} ${row + MARGIN}h${col - start}v1h-${col - start}z`);
        start = -1;
      }
    }
  }
  return parts.join("");
}

/**
 * The share code as a resolution-independent SVG.
 *
 * The previous version rasterised through `toDataURL`, which spins up a
 * canvas, PNG-encodes it and base64s the result into an `<img src>` — and it
 * did that inside an effect, so the code arrived a frame late and re-encoded
 * every time the archive changed. Drawing the module matrix directly is
 * cheaper, renders in the first paint, stays sharp at any pixel density, and
 * needs no `data:` URL for the CSP to allow.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const matrix = useMemo<Matrix | null>(() => {
    try {
      const qr = createQr(value, { errorCorrectionLevel: "L" });
      return { size: qr.modules.size, path: toPath(qr.modules) };
    } catch {
      // Thrown when the payload exceeds what any QR version can hold.
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div
        className="flex items-center justify-center rounded-3xl bg-muted p-6 text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        Too much data for a QR code — copy the text code instead.
      </div>
    );
  }

  const span = matrix.size + MARGIN * 2;

  return (
    <div
      className="flex items-center justify-center rounded-3xl bg-white p-3 shadow-sm"
      style={{ width: size, height: size }}
    >
      <svg
        role="img"
        aria-label="Share code QR"
        viewBox={`0 0 ${span} ${span}`}
        width={size - 24}
        height={size - 24}
        shapeRendering="crispEdges"
      >
        <path d={matrix.path} fill="#3a1f2b" />
      </svg>
    </div>
  );
}
