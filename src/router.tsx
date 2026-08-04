import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { currentNonce } from "./lib/nonce";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Nothing in this app is fetched from a server, so refetching on every
        // window focus is pure wasted work on a phone.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });

  const nonce = currentNonce();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Stamped onto every script tag the SSR render emits — the hydration
    // bootstrap, the streaming barrier and the module preloads — so the
    // Content-Security-Policy can refuse inline script outright instead of
    // falling back to 'unsafe-inline'. See src/lib/security.ts.
    ...(nonce ? { ssr: { nonce } } : {}),
  });
};
