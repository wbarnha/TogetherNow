import { cn } from "@/lib/utils";
import type { Owner } from "@/lib/app/types";

export function ownerClasses(owner: Owner) {
  switch (owner) {
    case "me":
      return "bg-mine-soft text-mine border-mine/25";
    case "them":
      return "bg-theirs-soft text-theirs border-theirs/25";
    default:
      return "bg-ours-soft text-ours-foreground border-ours/30";
  }
}

export function ownerLabel(owner: Owner, meName: string, themName: string) {
  if (owner === "me") return meName || "Me";
  if (owner === "them") return themName || "Them";
  return "Together";
}

export function OwnerBadge({
  owner,
  meName,
  themName,
  className,
}: {
  owner: Owner;
  meName: string;
  themName: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        ownerClasses(owner),
        className,
      )}
    >
      {ownerLabel(owner, meName, themName)}
    </span>
  );
}
