/**
 * A 128-bit content digest for deriving stable item ids.
 *
 * Every id computed from an item's own content used a 32-bit hash, and the
 * message one was worse than that: `Math.abs(h) >>> 0` folds the sign away and
 * leaves 31 usable bits. Ids are the archive's deduplication key, so a
 * collision is not a warning — the second item is silently taken for a
 * duplicate of the first and dropped. At the 200,000-message ceiling the
 * validator allows, 31 bits gives roughly five expected collisions; at 128
 * bits a collision has never been observed in anything anyone has built.
 *
 * MurmurHash3 (x86, 128-bit) is used rather than SHA-256 because
 * `crypto.subtle` is asynchronous, and these ids are computed inside
 * synchronous parsers on the main thread. Nothing here is a security boundary:
 * ids are not secrets and are never trusted for authentication, only for
 * "have I already got this?". What is needed is uniform spreading over a large
 * space, which is exactly what this provides — and what the tests check,
 * rather than trusting the implementation is faithful.
 */

const C1 = 0x239b961b;
const C2 = 0xab0e9789;
const C3 = 0x38b34ae5;
const C4 = 0xa1e38b93;

const encoder = typeof TextEncoder === "undefined" ? null : new TextEncoder();

function rotl(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

/** MurmurHash3's 32-bit finalizer: the avalanche step. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function utf8(value: string): Uint8Array {
  if (encoder) return encoder.encode(value);
  // Only reached in environments without TextEncoder; every runtime this app
  // targets has one.
  const out: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * 128 bits of digest over `value`, as 32 lowercase hex characters.
 *
 * Stable across runs, platforms and app versions: it depends on nothing but
 * the bytes handed in, which is what lets an id be recomputed later and still
 * match.
 */
export function digest128(value: string): string {
  const bytes = utf8(value);
  const len = bytes.length;
  const blocks = len >> 4;

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  let h4 = 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < blocks; i++) {
    const at = i << 4;
    let k1 = view.getUint32(at, true);
    let k2 = view.getUint32(at + 4, true);
    let k3 = view.getUint32(at + 8, true);
    let k4 = view.getUint32(at + 12, true);

    k1 = Math.imul(rotl(Math.imul(k1, C1), 15), C2);
    h1 ^= k1;
    h1 = rotl(h1, 19);
    h1 = (h1 + h2) | 0;
    h1 = (Math.imul(h1, 5) + 0x561ccd1b) | 0;

    k2 = Math.imul(rotl(Math.imul(k2, C2), 16), C3);
    h2 ^= k2;
    h2 = rotl(h2, 17);
    h2 = (h2 + h3) | 0;
    h2 = (Math.imul(h2, 5) + 0x0bcaa747) | 0;

    k3 = Math.imul(rotl(Math.imul(k3, C3), 17), C4);
    h3 ^= k3;
    h3 = rotl(h3, 15);
    h3 = (h3 + h4) | 0;
    h3 = (Math.imul(h3, 5) + 0x96cd1c35) | 0;

    k4 = Math.imul(rotl(Math.imul(k4, C4), 18), C1);
    h4 ^= k4;
    h4 = rotl(h4, 13);
    h4 = (h4 + h1) | 0;
    h4 = (Math.imul(h4, 5) + 0x32ac3b17) | 0;
  }

  // Whatever is left after the last whole 16-byte block. The reference
  // implementation assembles this with a fallthrough switch; the same bytes
  // read little-endian out of a zero-padded scratch are equivalent and do not
  // need the compiler's fallthrough check turned off to say so.
  const rest = len & 15;
  if (rest > 0) {
    const tail = new Uint8Array(16);
    tail.set(bytes.subarray(blocks << 4, len));
    const tailView = new DataView(tail.buffer);

    if (rest >= 1) {
      const k1 = Math.imul(rotl(Math.imul(tailView.getUint32(0, true), C1), 15), C2);
      h1 ^= k1;
    }
    if (rest >= 5) {
      const k2 = Math.imul(rotl(Math.imul(tailView.getUint32(4, true), C2), 16), C3);
      h2 ^= k2;
    }
    if (rest >= 9) {
      const k3 = Math.imul(rotl(Math.imul(tailView.getUint32(8, true), C3), 17), C4);
      h3 ^= k3;
    }
    if (rest >= 13) {
      const k4 = Math.imul(rotl(Math.imul(tailView.getUint32(12, true), C4), 18), C1);
      h4 ^= k4;
    }
  }

  h1 ^= len;
  h2 ^= len;
  h3 ^= len;
  h4 ^= len;

  h1 = (h1 + h2) | 0;
  h1 = (h1 + h3) | 0;
  h1 = (h1 + h4) | 0;
  h2 = (h2 + h1) | 0;
  h3 = (h3 + h1) | 0;
  h4 = (h4 + h1) | 0;

  h1 = fmix32(h1);
  h2 = fmix32(h2);
  h3 = fmix32(h3);
  h4 = fmix32(h4);

  h1 = (h1 + h2) | 0;
  h1 = (h1 + h3) | 0;
  h1 = (h1 + h4) | 0;
  h2 = (h2 + h1) | 0;
  h3 = (h3 + h1) | 0;
  h4 = (h4 + h1) | 0;

  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h3 >>> 0).toString(16).padStart(8, "0") +
    (h4 >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * An ASCII unit separator, written as an escape rather than the raw byte —
 * that byte is invisible in an editor, and deleting it by accident would
 * silently change every id in the app.
 *
 * A separator is needed at all because joining on nothing lets ("ab", "c") and
 * ("a", "bc") produce the same id. `|` was the old choice and is wrong for the
 * mirror-image reason: message text routinely contains one, so a field could
 * be shifted across a boundary. U+001F is stripped from every stored string by
 * the validator, so no real field can contain it.
 */
const FIELD_SEPARATOR = "\u001f";

/** Join fields into one digest input. */
export function digestOf(...fields: (string | number | undefined | null)[]): string {
  return digest128(
    fields.map((f) => (f === undefined || f === null ? "" : String(f))).join(FIELD_SEPARATOR),
  );
}
