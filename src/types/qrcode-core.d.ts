/**
 * Types for the deep import used by the QR component. The `qrcode` package
 * only ships declarations for its public entry point, but that entry is
 * CommonJS and drags the canvas and PNG renderers into the bundle, so the
 * encoder is imported directly instead.
 */
declare module "qrcode/lib/core/qrcode.js" {
  import type { QRCodeToDataURLOptions } from "qrcode";

  export function create(
    data: string,
    options?: QRCodeToDataURLOptions,
  ): {
    modules: { size: number; data: Uint8Array };
    version: number;
    maskPattern: number;
  };
}
