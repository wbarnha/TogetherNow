import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Heart, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/app/store";
import {
  SHARE_CATEGORIES,
  acceptAll,
  applyShareCode,
  parseShareCode,
  previewShareCode,
  type AcceptChoices,
} from "@/lib/app/share";
import { sendInvite } from "@/lib/app/invite";

/** "a, b and c" — so the confirmation names what was actually taken. */
function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Landing experience for the partner who opened an invite link. */
export function AcceptInvite({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const { state, setState } = useStore();
  const [name, setName] = useState(state.me.name);
  const [done, setDone] = useState<null | {
    added: number;
    updated: number;
    from: string;
    categories: string[];
  }>(null);
  // Everything on by default, but every category is named and can be dropped
  // before it lands.
  const [choices, setChoices] = useState<AcceptChoices>(acceptAll);

  const parsed = useMemo(() => {
    try {
      return { payload: parseShareCode(code), error: null as string | null };
    } catch (err) {
      return {
        payload: null,
        error: err instanceof Error ? err.message : "That invite link couldn't be read.",
      };
    }
  }, [code]);

  if (parsed.error || !parsed.payload) {
    return (
      <div className="space-y-4 rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="font-display text-xl font-semibold">This invite didn&apos;t open</h2>
        <p className="text-sm text-muted-foreground">{parsed.error}</p>
        <Button variant="secondary" className="w-full" onClick={onDismiss}>
          Paste the code by hand
        </Button>
      </div>
    );
  }

  const preview = previewShareCode(parsed.payload);

  const accept = () => {
    try {
      const { state: merged, summary } = applyShareCode(state, parsed.payload!, choices);
      setState(() => ({
        ...merged,
        onboarded: true,
        me: { ...merged.me, name: name.trim() || merged.me.name },
        inviteFailedAt: null,
      }));
      setDone({
        added: summary.added,
        updated: summary.updated,
        from: summary.from,
        categories: rows.filter((r) => choices[r.key]).map((r) => r.label.toLowerCase()),
      });
      toast.success(`You're connected with ${summary.from}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That invite couldn't be merged");
    }
  };

  const sendBack = async () => {
    const result = await sendInvite(state);
    if (result === "failed") {
      setState((prev) => ({ ...prev, inviteFailedAt: Date.now() }));
      toast.error("Couldn't share your code", { action: { label: "Retry", onClick: sendBack } });
      return;
    }
    setState((prev) => ({ ...prev, inviteSentAt: Date.now(), inviteFailedAt: null }));
    toast.success(result === "shared" ? "Your code is on its way" : "Your code was copied");
  };

  if (done) {
    return (
      <div className="space-y-4 rounded-3xl border border-ours/30 bg-ours-soft p-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ours/20 text-ours-foreground">
          <Check className="size-6" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">Connected with {done.from}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {done.added + done.updated > 0
              ? `${done.added} new and ${done.updated} updated item${
                  done.added + done.updated === 1 ? "" : "s"
                } are on your phone${
                  done.categories.length ? ` — ${formatList(done.categories)}` : ""
                }.`
              : "Everything was already up to date."}
          </p>
        </div>
        <div className="space-y-2">
          <Button className="w-full" onClick={sendBack}>
            <Send className="size-4" /> Send {done.from} your code back
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/">See our Together items</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Every category the code actually carries, not a hand-picked four. The
  // sensitive ones are called out rather than folded in silently.
  const rows = SHARE_CATEGORIES.map((c) => ({ ...c, count: preview.counts[c.key] })).filter(
    (r) => r.count > 0,
  );
  const nothingChosen = rows.every((r) => !choices[r.key]);

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Sparkles className="size-6" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">
            {preview.from} invited you to Together Now
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept to pull their plans, dates and Together list onto this phone. Nothing is uploaded
            anywhere — it all stays on your device.
          </p>
        </div>

        {rows.length ? (
          <div className="space-y-2 text-left">
            <p className="px-1 text-xs text-muted-foreground">
              Choose what to bring across. You can turn any of these off.
            </p>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2 text-sm"
                >
                  <Checkbox
                    id={`accept-${r.key}`}
                    checked={choices[r.key]}
                    onCheckedChange={(v) =>
                      setChoices((prev) => ({ ...prev, [r.key]: v === true }))
                    }
                  />
                  <Label htmlFor={`accept-${r.key}`} className="flex-1 cursor-pointer font-normal">
                    {r.label}
                    {r.sensitive ? (
                      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        personal
                      </span>
                    ) : null}
                  </Label>
                  <span className="font-medium">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2 text-left">
          <Label htmlFor="accept-name">Your name</Label>
          <Input
            id="accept-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="So they know who's who"
          />
        </div>

        <Button size="lg" className="w-full" onClick={accept} disabled={nothingChosen}>
          <Heart className="size-4" />
          {nothingChosen ? "Pick at least one thing" : `Connect with ${preview.from}`}
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-full px-1 text-center text-xs text-muted-foreground underline"
      >
        Not now — I&apos;ll paste a code manually
      </button>
    </div>
  );
}
