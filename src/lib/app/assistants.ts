import { safeExternalUrl } from "./safe-url";

/** ChatGPT and Claude quick-launch links, with the prompt prefilled where supported. */
export type AssistantId = "chatgpt" | "claude";

export type Assistant = {
  id: AssistantId;
  name: string;
  accent: string;
  /** opens a new chat with the prompt in the composer */
  link: (prompt: string) => string;
  /** native app scheme, tried first on phones */
  appLink?: (prompt: string) => string;
  note: string;
};

export const ASSISTANTS: Assistant[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    accent: "#10a37f",
    link: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`,
    appLink: (p) => `chatgpt://?q=${encodeURIComponent(p)}`,
    note: "Opens a new chat with the brief ready to send",
  },
  {
    id: "claude",
    name: "Claude",
    accent: "#d97757",
    link: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
    note: "Opens a new chat with the brief ready to send",
  },
];

/** Long prompts can exceed URL limits, so copy first and then open. */
export async function launchAssistant(assistant: Assistant, prompt: string) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(prompt);
    copied = true;
  } catch {
    /* clipboard blocked — the URL still carries the prompt */
  }
  const short = prompt.length <= 1500;
  const target = safeExternalUrl(assistant.link(short ? prompt : ""));
  if (target) window.open(target, "_blank", "noopener,noreferrer");
  return { copied, prefilled: short && target !== undefined };
}
