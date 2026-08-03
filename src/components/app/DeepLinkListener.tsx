import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Handles taps on the native home-screen widget:
 * togethernow://mood?score=4 (and https://…/mood?mood=4).
 */
export function DeepLinkListener() {
  const navigate = useNavigate();

  useEffect(() => {
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          try {
            const parsed = new URL(url);
            const score = parsed.searchParams.get("score") ?? parsed.searchParams.get("mood");
            if (parsed.pathname.includes("mood") || parsed.host === "mood" || score) {
              void navigate({ to: "/mood", search: score ? { mood: Number(score) } : {} });
            }
          } catch {
            /* ignore malformed deep links */
          }
        });
        remove = () => void handle.remove();
      } catch {
        /* not running natively */
      }
    })();
    return () => remove?.();
  }, [navigate]);

  return null;
}