import { createFileRoute, Link } from "@tanstack/react-router";
import { QrCode, RotateCcw, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TIME_ZONES, zoneLabel } from "@/lib/app/time";
import { MESSENGERS } from "@/lib/app/messengers";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "You two — Together Now" },
      {
        name: "description",
        content: "Names, time zones, messaging handles, reminders, and your data backup code.",
      },
      { property: "og:title", content: "You two — Together Now" },
      {
        property: "og:description",
        content: "Set up both profiles, time zones, and reminders.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, setState, reset } = useStore();

  return (
    <AppShell title="You two" subtitle="Everything is stored on this device only.">
      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Profiles</h2>

        <div className="space-y-3 rounded-2xl bg-mine-soft/60 p-4">
          <Label htmlFor="me-name" className="text-mine">
            You
          </Label>
          <Input
            id="me-name"
            value={state.me.name}
            placeholder="Your name"
            onChange={(e) => setState((p) => ({ ...p, me: { ...p.me, name: e.target.value } }))}
          />
          <ZonePicker
            value={state.me.timeZone}
            onChange={(tz) => setState((p) => ({ ...p, me: { ...p.me, timeZone: tz } }))}
          />
        </div>

        <div className="space-y-3 rounded-2xl bg-theirs-soft/60 p-4">
          <Label htmlFor="them-name" className="text-theirs">
            Them
          </Label>
          <Input
            id="them-name"
            value={state.them.name}
            placeholder="Their name"
            onChange={(e) => setState((p) => ({ ...p, them: { ...p.them, name: e.target.value } }))}
          />
          <ZonePicker
            value={state.them.timeZone}
            onChange={(tz) => setState((p) => ({ ...p, them: { ...p.them, timeZone: tz } }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start-date">Together since</Label>
          <Input
            id="start-date"
            type="date"
            value={state.startDate ?? ""}
            onChange={(e) => setState((p) => ({ ...p, startDate: e.target.value || null }))}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {state.them.name || "Their"} handles
          </h2>
          <p className="text-xs text-muted-foreground">
            Used to build one-tap shortcuts on the Reach tab.
          </p>
        </div>
        {MESSENGERS.map((m) => (
          <div key={m.id} className="space-y-1.5">
            <Label htmlFor={`h-${m.id}`} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: m.accent }} />
              {m.name}
              <span className="text-xs font-normal text-muted-foreground">{m.handleLabel}</span>
            </Label>
            <Input
              id={`h-${m.id}`}
              value={state.them.handles[m.id] ?? ""}
              placeholder={m.placeholder}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  them: {
                    ...p.them,
                    handles: { ...p.them.handles, [m.id]: e.target.value },
                  },
                }))
              }
            />
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Preferences</h2>
        <div className="space-y-2">
          <Label htmlFor="lead">Remind me this many days ahead</Label>
          <Input
            id="lead"
            type="number"
            min={0}
            max={60}
            value={state.reminderLeadDays}
            onChange={(e) =>
              setState((p) => ({
                ...p,
                reminderLeadDays: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Reminders are scheduled on this device when the app runs on your phone.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setState((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }))}
        >
          {state.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {state.theme === "dark" ? "Switch to light" : "Switch to dark"}
        </Button>
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Your data</h2>
        <Button asChild variant="outline" className="w-full">
          <Link to="/pair">
            <QrCode className="size-4" /> Share or import a code
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive">
              <RotateCcw className="size-4" /> Erase everything
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Erase all data?</AlertDialogTitle>
              <AlertDialogDescription>
                Plans, dates, and profiles on this device are deleted. Your partner&apos;s copy is
                untouched — you can import their code to get shared items back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  reset();
                  toast.success("Everything erased");
                }}
              >
                Erase
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </AppShell>
  );
}

function ZonePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = TIME_ZONES.includes(value) ? TIME_ZONES : [value, ...TIME_ZONES];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full bg-card">
        <SelectValue placeholder="Time zone" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((tz) => (
          <SelectItem key={tz} value={tz}>
            {zoneLabel(tz)}
            <span className="ml-2 text-xs text-muted-foreground">{tz}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
