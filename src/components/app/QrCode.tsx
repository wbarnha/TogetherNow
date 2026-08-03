import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTooLong(false);
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: "L",
      color: { dark: "#3a1f2b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          setTooLong(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (tooLong) {
    return (
      <div
        className="flex items-center justify-center rounded-3xl bg-muted p-6 text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        Too much data for a QR code — copy the text code instead.
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-3xl bg-white p-3 shadow-sm"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="Share code QR" width={size - 24} height={size - 24} />
      ) : null}
    </div>
  );
}