import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, QrCode as QrIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { QrCode } from "@/components/app/QrCode";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/app/store";
import { applyShareCode, buildShareCode, parseShareCode } from "@/lib/app/share";

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

  const code = useMemo(() => (hydrated ? buildShareCode(state) : ""), [state, hydrated]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
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
      title="Share code"
      subtitle="Nothing leaves your phone until you hand this over."
      action={
        <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <Tabs defaultValue="send">
        <TabsList className="grid w-full grid-cols-2 rounded-2xl">
          <TabsTrigger value="send" className="rounded-xl">
            Send mine
          </TabsTrigger>
          <TabsTrigger value="receive" className="rounded-xl">
            Receive theirs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4 space-y-4">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card p-5">
            <QrCode value={code || "TN1:"} />
            <p className="text-center text-sm text-muted-foreground">
              Let {state.them.name || "your partner"} scan this with their camera, or send
              them the text code below.
            </p>
            <Button onClick={copy} className="w-full">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy text code"}
            </Button>
          </div>
          <details className="rounded-3xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Show the raw code
            </summary>
            <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
              {code}
            </p>
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
              Scanning a QR with your phone camera opens the code as text — copy and paste
              it here. Merging keeps whichever version of an item was edited most recently.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}