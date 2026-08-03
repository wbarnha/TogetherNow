import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarHeart, Check, Heart, MapPin, PiggyBank, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/app/store";
import { applyShareCode, parseShareCode, previewShareCode } from "@/lib/app/share";
import { sendInvite } from "@/lib/app/invite";

/** Landing experience for the partner who opened an invite link. */
export function AcceptInvite({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const { state, setState } = useStore();
  const [name, setName] = useState(state.me.name);
  const [done, setDone] = useState<null | { added: number; updated: number; from: string }>(null);

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
      const { state: merged, summary } = applyShareCode(state, parsed.payload!);
      setState(() => ({
        ...merged,
        onboarded: true,
        me: { ...merged.me, name: name.trim() || merged.me.name },
        inviteFailedAt: null,
      }));
      setDone({ added: summary.added, updated: summary.updated, from: summary.from });
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
                } are on your phone — plans, big dates and your Together list.`
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

  const rows = [
    { icon: CalendarHeart, label: "Plans", count: preview.events },
    { icon: Heart, label: "Big dates", count: preview.milestones },
    { icon: MapPin, label: "Together list ideas", count: preview.places },
    { icon: PiggyBank, label: "Savings goals", count: preview.goals },
  ].filter((r) => r.count > 0);

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
          <ul className="space-y-2 text-left">
            {rows.map((r) => (
              <li
                key={r.label}
                className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2 text-sm"
              >
                <r.icon className="size-4 text-primary" />
                <span className="flex-1">{r.label}</span>
                <span className="font-medium">{r.count}</span>
              </li>
            ))}
          </ul>
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

        <Button size="lg" className="w-full" onClick={accept}>
          <Heart className="size-4" /> Connect with {preview.from}
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
