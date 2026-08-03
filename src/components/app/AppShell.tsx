import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Heart, MapPin, MessageCircle, Plane, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Home", icon: Heart },
  { to: "/calendar", label: "Plans", icon: CalendarDays },
  { to: "/milestones", label: "Dates", icon: Sparkles },
  { to: "/places", label: "Ideas", icon: MapPin },
  { to: "/travel", label: "Travel", icon: Plane },
  { to: "/messages", label: "Reach", icon: MessageCircle },
  { to: "/settings", label: "You", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg pb-28">
        <header className="safe-top flex items-start justify-between gap-3 px-5 pb-4">
          <div>
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {action}
        </header>
        <main className="space-y-4 px-5">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/90 backdrop-blur-xl">
        <ul className="safe-bottom mx-auto flex max-w-lg items-stretch justify-between px-1 pt-2">
          {TABS.map((tab) => {
            const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <li key={tab.to} className="flex-1">
                <Link
                  to={tab.to}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[10px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-5", active && "fill-primary/15")} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}