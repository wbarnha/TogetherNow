import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Heart, QrCode as QrIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { QrCode } from "@/components/app/QrCode";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/app/store";
import { applyShareCode, buildShareCode, parseShareCode } from "@/lib/app/share";
import { inviteLink, readInviteCode, sendInvite } from "@/lib/app/invite";
import { InviteStatusBanner } from "@/components/app/InviteStatus";
import { AcceptInvite } from "@/components/app/AcceptInvite";

export const Route = createFileRoute("/pair")({
  head: () => ({
    meta: [
      { title: "Share code — Together Now" },
      {
        name: "description",
        content:
          "Swap a QR or text share code with your partner to merge your plans and important dates.",
      },
      { property: "og:title", content: "Share code — Together Now" },
      {
        property: "og:description",
        content: "Merge your calendars and dates without any account or server.",
      },
    ],
  }),
  component: PairPage,
});

function PairPage() {
  const router = useRouter();
  const { state, setState, hydrated } = useStore();
  const [incoming, setIncoming] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("invite");
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const code = useMemo(() => (hydrated ? buildShareCode(state) : ""), [state, hydrated]);

  // Opening an invite link lands here with their code ready to merge.
  useEffect(() => {
    const found = readInviteCode(window.location);
    if (!found) return;
    setIncoming(found.code);
    setInviteCode(found.code);
    setTab("receive");
    // Take the payload out of the address bar either way: it is the partner's
    // whole archive, and leaving it there puts it in browser history, in the
    // share sheet, and in the `Referer` sent to anything this page links to.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const invite = async () => {
    const result = await sendInvite(state);
    if (result === "failed") {
      setState((prev) => ({ ...prev, inviteFailedAt: Date.now() }));
      toast.error("Couldn't share the invite", { action: { label: "Retry", onClick: invite } });
      return;
    }
    setState((prev) => ({
      ...prev,
      inviteSentAt: Date.now(),
      inviteFailedAt: null,
      lastSharedAt: Date.now(),
    }));
    if (result === "shared") toast.success("Invite sent");
    else toast.success("Invite copied — paste it to your partner");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setState((prev) => ({ ...prev, lastSharedAt: Date.now() }));
      setTimeout(() => setCopied(false), 2000);
      toast.success("Share code copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  };

  const importCode = () => {
    try {
      const payload = parseShareCode(incoming);
      const { state: next, summary } = applyShareCode(state, payload);
      setState(() => next);
      setIncoming("");
      toast.success(
        summary.added || summary.updated
          ? `Merged ${summary.added} new and ${summary.updated} updated item${
              summary.added + summary.updated === 1 ? "" : "s"
            } from ${summary.from}`
          : `Already up to date with ${summary.from}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code couldn't be read");
    }
  };

  return (
    <AppShell
      title={inviteCode ? "Invite" : "Share code"}
      subtitle={
        inviteCode
          ? "Accept to bring your partner's plans onto this phone."
          : "Nothing leaves your phone until you hand this over."
      }
      action={
        <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {inviteCode ? (
        <AcceptInvite code={inviteCode} onDismiss={() => setInviteCode(null)} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="invite" className="rounded-xl">
              Invite
            </TabsTrigger>
            <TabsTrigger value="send" className="rounded-xl">
              Send mine
            </TabsTrigger>
            <TabsTrigger value="receive" className="rounded-xl">
              Receive
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite" className="mt-4 space-y-4">
            <InviteStatusBanner state={state} onRetry={invite} />
            <div className="space-y-4 rounded-3xl border border-border bg-card p-5 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Heart className="size-6" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Invite {state.them.name || "your partner"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Send them a link. Opening it on their phone connects you two and pulls in your
                  plans, dates and Together list.
                </p>
              </div>
              <Button onClick={invite} size="lg" className="w-full">
                <Send className="size-4" />
                {state.inviteFailedAt
                  ? "Retry invite"
                  : state.inviteSentAt
                    ? "Send again"
                    : "Send invite"}
              </Button>
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {hydrated ? inviteLink(state) : ""}
              </p>
            </div>
            <p className="px-1 text-xs text-muted-foreground">
              {state.pairedAt
                ? "Re-send any time to share your latest items."
                : "Not connected yet — once they open your link (or you merge their code), shared items start flowing both ways."}
            </p>
          </TabsContent>

          <TabsContent value="send" className="mt-4 space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-5">
              <QrCode value={code || "TN1:"} />
              <p className="text-center text-sm text-muted-foreground">
                Let {state.them.name || "your partner"} scan this with their camera, or send them
                the text code below.
              </p>
              <Button onClick={copy} className="w-full">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy text code"}
              </Button>
            </div>
            <details className="rounded-3xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">Show the raw code</summary>
              <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">{code}</p>
            </details>
          </TabsContent>

          <TabsContent value="receive" className="mt-4 space-y-4">
            <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrIcon className="size-4 text-primary" />
                Paste their code
              </div>
              <Textarea
                value={incoming}
                onChange={(e) => setIncoming(e.target.value)}
                rows={5}
                placeholder="TN1:…"
                className="font-mono text-xs"
              />
              <Button onClick={importCode} disabled={!incoming.trim()} className="w-full">
                Merge into my app
              </Button>
              <p className="text-xs text-muted-foreground">
                Scanning a QR with your phone camera opens the code as text — copy and paste it
                here. Merging keeps whichever version of an item was edited most recently.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
