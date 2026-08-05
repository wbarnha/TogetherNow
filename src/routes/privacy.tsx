import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import appConfig from "../../native/app.json";

/**
 * The privacy policy, served from the app itself.
 *
 * Both stores require a reachable privacy policy URL for every app, whether or
 * not it collects anything — Apple on the App Store listing, Google on the
 * Play listing and again inside the Data Safety form. Keeping it here rather
 * than on a separate marketing site means the claims sit next to the code that
 * has to keep them true, and `native/app.json` points both listings at it.
 *
 * Every claim below is checked by scripts/verify-store-readiness.mjs or by the
 * tests in src/lib — see STORE.md for the mapping.
 */

const UPDATED = "4 August 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy — ${appConfig.appName}` },
      {
        name: "description",
        content:
          "Together Now has no backend and no accounts. Everything you enter stays on your device.",
      },
      { property: "og:title", content: `Privacy — ${appConfig.appName}` },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-20 safe-top">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/settings">
            <ArrowLeft className="size-4" /> Back
          </Link>
        </Button>

        <h1 className="font-display text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {UPDATED}</p>

        <div className="mt-8 space-y-8">
          <Section title="The short version">
            <p>
              {appConfig.appName} has no backend, no accounts and no analytics. Everything you enter
              — plans, important dates, date ideas, trips, money, mood check-ins, and any message or
              viewing history you import — is stored on your device and nowhere else. We cannot see
              any of it, because it never reaches us. There is no &ldquo;us&rdquo; to reach: no
              server holds your data.
            </p>
          </Section>

          <Section title="What stays on your device">
            <p>
              Your archive lives in your browser&apos;s own on-device database, or inside the
              app&apos;s private storage on iOS and Android. On Android it is explicitly excluded
              from Google Drive backup and from device-to-device transfer, so a phone backup does
              not carry it off the handset either.
            </p>
            <p>
              Deleting the app removes it. You can also erase everything at any time from{" "}
              <span className="text-foreground">You two → Erase everything</span>, which clears the
              archive on that device immediately and permanently.
            </p>
          </Section>

          <Section title="What leaves your device, and only when you ask">
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <span className="text-foreground">Share codes.</span> When you send your partner an
                invite or a share code, the selected items are packed into that code and handed to
                whatever app you choose to send it with — a message, a QR code on your screen, your
                clipboard. It goes directly to them. It does not pass through a server of ours. You
                choose what a code contains under{" "}
                <span className="text-foreground">Partner → what&apos;s shared</span>.
              </li>
              <li>
                <span className="text-foreground">Place search.</span> If you type a town or address
                into the location picker on the Ideas screen, that text is sent to
                OpenStreetMap&apos;s Nominatim service to turn it into coordinates. Only the words
                you typed are sent. This happens only while you are actively searching.
              </li>
              <li>
                <span className="text-foreground">Map tiles.</span> Opening the map view on the
                Ideas screen loads map imagery from OpenStreetMap. Like any map, that reveals
                roughly which part of the world you are looking at to the tile server.
              </li>
              <li>
                <span className="text-foreground">Links you tap.</span> Opening a place in your maps
                app, a booking link, a messaging shortcut or an AI assistant hands off to that app
                or site, which then applies its own privacy policy.
              </li>
            </ul>
            <p>
              That is the complete list. The app is built so it cannot quietly grow: its
              Content-Security-Policy permits network connections only to itself and to the place
              search above, and the build fails if any other destination appears in it.
            </p>
          </Section>

          <Section title="Location">
            <p>
              The Ideas screen has a &ldquo;use my location&rdquo; button that sorts your saved
              places by distance. Your device asks your permission first, the coordinates are used
              on the spot, and they are never stored or transmitted. On Android the app requests
              only approximate location, because a distance filter does not need a precise fix. You
              can decline and pick an area by hand instead; nothing else in the app changes.
            </p>
          </Section>

          <Section title="Notifications">
            <p>
              Reminders for plans and important dates are scheduled by your own device from data
              already on it. Nothing is pushed from a server, and no notification content is sent
              anywhere.
            </p>
          </Section>

          <Section title="What you import">
            <p>
              You can import calendars, saved places, chat exports and viewing history that you have
              downloaded from other services. Those files are read in the app on your device and the
              results are saved into your local archive. The files are not uploaded anywhere.
            </p>
            <p>
              Please only import exports of your own conversations and activity, and be mindful that
              a chat export contains someone else&apos;s words as well as yours.
            </p>
          </Section>

          <Section title="Children">
            <p>
              {appConfig.appName} is intended for adults in a relationship and is not directed at
              children. Because it collects nothing, it holds no children&apos;s data.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              Rights to access, correct, export and delete personal data — under the GDPR, the CCPA
              and similar laws — apply to data a company holds about you. We hold none. In practice:
              your data is already in your hands, the app can export your calendar and place lists
              as standard files at any time, and &ldquo;Erase everything&rdquo; is a complete
              deletion. There is no request to make and no account to close.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If a future version of the app sends anything new anywhere, this page will say so
              before that version ships, and the store listings&apos; privacy disclosures will be
              updated to match.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy:{" "}
              <a className="text-primary underline" href={appConfig.supportUrl}>
                {appConfig.supportUrl.replace(/^https?:\/\//, "")}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
