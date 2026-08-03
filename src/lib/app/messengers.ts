import type { MessengerId } from "./types";

export type MessengerDef = {
  id: MessengerId;
  name: string;
  /** what the user types in as the handle */
  handleLabel: string;
  placeholder: string;
  hint: string;
  accent: string;
  /** deep link built from the stored handle; null when no handle is set */
  link: (handle: string) => string;
  webFallback?: (handle: string) => string;
};

const clean = (h: string) => h.trim().replace(/^@/, "");

export const MESSENGERS: MessengerDef[] = [
  {
    id: "imessage",
    name: "iMessage",
    handleLabel: "Phone or Apple ID",
    placeholder: "+15551234567",
    hint: "Opens Messages with your thread ready",
    accent: "#34c759",
    link: (h) => `sms:${clean(h)}`,
  },
  {
    id: "facetime",
    name: "FaceTime",
    handleLabel: "Phone or Apple ID",
    placeholder: "+15551234567",
    hint: "Starts a FaceTime call",
    accent: "#30d158",
    link: (h) => `facetime:${clean(h)}`,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    handleLabel: "Phone number",
    placeholder: "+15551234567",
    hint: "Jumps to your chat",
    accent: "#25d366",
    link: (h) => `https://wa.me/${clean(h).replace(/[^0-9]/g, "")}`,
  },
  {
    id: "telegram",
    name: "Telegram",
    handleLabel: "Username",
    placeholder: "username",
    hint: "Jumps to your chat",
    accent: "#29a9eb",
    link: (h) => `https://t.me/${clean(h)}`,
  },
  {
    id: "discord",
    name: "Discord",
    handleLabel: "User ID",
    placeholder: "123456789012345678",
    hint: "Opens your DM (needs their numeric user ID)",
    accent: "#5865f2",
    link: (h) => `discord://discordapp.com/users/${clean(h)}`,
    webFallback: (h) => `https://discord.com/users/${clean(h)}`,
  },
  {
    id: "instagram",
    name: "Instagram",
    handleLabel: "Username",
    placeholder: "username",
    hint: "Opens their profile, then tap Message",
    accent: "#e1306c",
    link: (h) => `instagram://user?username=${clean(h)}`,
    webFallback: (h) => `https://instagram.com/${clean(h)}`,
  },
];

export const messengerById = (id: MessengerId) =>
  MESSENGERS.find((m) => m.id === id) as MessengerDef;
