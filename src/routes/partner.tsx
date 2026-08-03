import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Heart, HeartCrack, QrCode, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useStore } from "@/lib/app/store";
import { zoneLabel } from "@/lib/app/time";
import { SHARING_ITEMS, disconnectPartner, sharingCounts, switchPartner } from "@/lib/app/partner";

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: "Partner & sharing — Together Now" },
      {
        name: "description",
        content:
          "See who you are connected with, choose what goes into your share code, and remove or switch partners.",
      },
      { property: "og:title", content: "Partner & sharing — Together Now" },
      {
        property: "og:description",
        content: "Manage your connection and control exactly what is shared in Together.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerPage,
});

function PartnerPage() {
  const { state, setState } = useStore();
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const counts = sharingCounts(state);
  const connected = state.pairedAt != null;
  const themName = state.them.name || "Your partner";

  return (
    <AppShell title="Partner" subtitle="Who you're connected with and what they receive.">
      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{themName}</h2>
            <p className="text-sm text-muted-foreground">
              {zoneLabel(state.them.timeZone)} · {state.them.timeZone}
            </p>
          </div>
          <Badge variant={connected ? "default" : "secondary"} className="shrink-0">
            {connected ? (
              <>
                <Heart className="size-3" /> Connected
              </>
            ) : (
              "Not connected"
            )}
          </Badge>
        </div>
        {connected ? (
          <p className="text-xs text-muted-foreground">
            Paired {new Date(state.pairedAt as number).toLocaleDateString()}.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline">
            <Link to="/pair">
              <QrCode className="size-4" /> Share or import a code
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/settings">Edit names & time zones</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">What gets shared</h2>
          <p className="text-xs text-muted-foreground">
            Applies to every code, invite link and Together hand-off you send from this device.
          </p>
        </div>
        {SHARING_ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`share-${item.key}`}>{item.label}</Label>
              <p className="text-xs text-muted-foreground">
                {item.hint} · {counts[item.key]} item{counts[item.key] === 1 ? "" : "s"}
              </p>
            </div>
            <Switch
              id={`share-${item.key}`}
              checked={state.sharing[item.key]}
              onCheckedChange={(on) =>
                setState((p) => ({ ...p, sharing: { ...p.sharing, [item.key]: on } }))
              }
            />
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Manage connection</h2>

        <ConfirmAction
          trigger={
            <Button variant="outline" className="w-full justify-start">
              <HeartCrack className="size-4" /> Disconnect {themName}
            </Button>
          }
          title={`Disconnect ${themName}?`}
          description="You stop being paired and no new codes are exchanged. Everything already on this device stays put."
          confirmLabel="Disconnect"
          onConfirm={() => {
            setState((p) => disconnectPartner(p, false));
            toast.success("Disconnected", { description: "Your items are still here." });
          }}
        />

        <ConfirmAction
          trigger={
            <Button variant="outline" className="w-full justify-start">
              <HeartCrack className="size-4" /> Disconnect and remove their items
            </Button>
          }
          title="Remove everything of theirs?"
          description="Deletes plans, dates, ideas, mood check-ins and expenses that came from them. Your own items are untouched."
          confirmLabel="Remove"
          onConfirm={() => {
            setState((p) => disconnectPartner(p, true));
            toast.success("Their items removed");
          }}
        />

        <div className="space-y-2 rounded-2xl bg-muted/40 p-4">
          <Label htmlFor="new-partner">Switch partner</Label>
          <Input
            id="new-partner"
            value={newName}
            placeholder="New partner's name"
            onChange={(e) => setNewName(e.target.value)}
          />
          <ConfirmAction
            trigger={
              <Button className="w-full" disabled={!newName.trim()}>
                <UserRoundPlus className="size-4" /> Start fresh
              </Button>
            }
            title={`Switch to ${newName.trim() || "someone new"}?`}
            description="Their profile, shared items and saved amounts are cleared so you can send a new invite. Your own plans, ideas and money stay."
            confirmLabel="Switch"
            onConfirm={() => {
              setState((p) => switchPartner(p, newName.trim()));
              setNewName("");
              toast.success("Ready for a new invite");
              void router.navigate({ to: "/pair" });
            }}
          />
        </div>
      </section>
    </AppShell>
  );
}

function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
