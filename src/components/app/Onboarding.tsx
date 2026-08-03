import { useState } from "react";
import { Heart } from "lucide-react";
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
import { useStore } from "@/lib/app/store";
import { TIME_ZONES, zoneLabel } from "@/lib/app/time";

export function Onboarding() {
  const { state, setState } = useStore();
  const [meName, setMeName] = useState(state.me.name);
  const [themName, setThemName] = useState(state.them.name);
  const [meZone, setMeZone] = useState(state.me.timeZone);
  const [themZone, setThemZone] = useState(state.them.timeZone);
  const [start, setStart] = useState(state.startDate ?? "");

  const zones = (current: string) =>
    TIME_ZONES.includes(current) ? TIME_ZONES : [current, ...TIME_ZONES];

  const done = meName.trim() && themName.trim();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg px-5 pb-16 safe-top">
        <div className="flex flex-col items-center pt-10 pb-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <Heart className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-4xl leading-tight font-semibold">
            Together Now
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Two people, two time zones, one set of plans. Nothing leaves your phone.
          </p>
        </div>

        <div className="space-y-4 rounded-3xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="ob-me">Your name</Label>
            <Input
              id="ob-me"
              value={meName}
              onChange={(e) => setMeName(e.target.value)}
              placeholder="Alex"
            />
            <Select value={meZone} onValueChange={setMeZone}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones(meZone).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {zoneLabel(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-them">Their name</Label>
            <Input
              id="ob-them"
              value={themName}
              onChange={(e) => setThemName(e.target.value)}
              placeholder="Sam"
            />
            <Select value={themZone} onValueChange={setThemZone}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones(themZone).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {zoneLabel(tz)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ob-start">Together since (optional)</Label>
            <Input
              id="ob-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!done}
            onClick={() =>
              setState((p) => ({
                ...p,
                onboarded: true,
                me: { ...p.me, name: meName.trim(), timeZone: meZone },
                them: { ...p.them, name: themName.trim(), timeZone: themZone },
                startDate: start || null,
              }))
            }
          >
            Start
          </Button>
        </div>
      </div>
    </div>
  );
}