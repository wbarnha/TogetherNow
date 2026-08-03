import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AppState } from "@/lib/app/types";

export type InviteState = "idle" | "pending" | "connected" | "failed";

export function inviteStatus(state: AppState): InviteState {
  if (state.pairedAt) return "connected";
  if (state.inviteFailedAt) return "failed";
  if (state.inviteSentAt) return "pending";
  return "idle";
}

const ago = (ts: number | null) =>
  ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : "";

/** Pending / connected / failed banner for the partner invite. */
export function InviteStatusBanner({
  state,
  onRetry,
  className,
}: {
  state: AppState;
  onRetry?: () => void;
  className?: string;
}) {
  const status = inviteStatus(state);
  if (status === "idle") return null;
  const them = state.them.name || "your partner";

  const tone =
    status === "connected"
      ? "border-ours/30 bg-ours-soft text-ours-foreground"
      : status === "failed"
        ? "border-destructive/30 bg-destructive/5"
        : "border-primary/30 bg-primary/5";

  const Icon = status === "connected" ? CheckCircle2 : status === "failed" ? TriangleAlert : Clock;

  const title =
    status === "connected"
      ? `Connected with ${them}`
      : status === "failed"
        ? "Invite didn't go through"
        : `Invite pending with ${them}`;

  const detail =
    status === "connected"
      ? `Paired ${ago(state.pairedAt)} — Together items merge whenever you swap codes.`
      : status === "failed"
        ? `The last attempt ${ago(state.inviteFailedAt)} was cancelled or blocked. Try sending it again.`
        : `Sent ${ago(state.inviteSentAt)}. You'll show as connected once you merge their code.`;

  return (
    <div className={cn("flex items-start gap-3 rounded-3xl border p-4", tone, className)}>
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          status === "failed" ? "text-destructive" : status === "pending" ? "text-primary" : "",
        )}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {status !== "connected" && onRetry ? (
          <Button
            size="sm"
            variant={status === "failed" ? "destructive" : "secondary"}
            className="rounded-xl"
            onClick={onRetry}
          >
            {status === "failed" ? "Retry invite" : "Send again"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}