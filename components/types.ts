// Shared types and constants for the SiteAgent UI
import type { AgentEvent } from "@/lib/agent";

export type Item =
  | AgentEvent
  | { type: "error"; text: string }
  | { type: "user"; text: string }
  | { type: "export"; label: string; url: string; extra?: string };

export type ProviderId = "claude" | "openai" | "gemini" | "groq";
export type Settings = {
  brain: "auto" | "free" | "openrouter" | ProviderId; // "openrouter" = connected with one click
  orModel: string;
  keys: Partial<Record<ProviderId, string>>; // advanced: your own API keys
  models: Partial<Record<ProviderId, string>>;
};
export type Conns = { github: { login: string } | null; githubReady: boolean; openrouter: boolean; vercelToken: boolean };
export const EMPTY_SETTINGS: Settings = { brain: "auto", orModel: "anthropic/claude-sonnet-5.5", keys: {}, models: {} };
export const NO_CONNS: Conns = { github: null, githubReady: false, openrouter: false, vercelToken: false };
export const OR_MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", note: "Best design quality" },
  { id: "openai/gpt-6.2-sol", name: "ChatGPT · GPT-6.2 Sol", note: "OpenAI" },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", note: "Fast & cheap" },
];
export const PROVIDERS: { id: ProviderId; name: string; model: string; link: string }[] = [
  { id: "claude", name: "Claude", model: "claude-sonnet-5-5", link: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "ChatGPT (OpenAI)", model: "gpt-6.2-sol", link: "https://platform.openai.com/api-keys" },
  { id: "gemini", name: "Gemini (free tier)", model: "gemini-3.5-flash", link: "https://aistudio.google.com/apikey" },
  { id: "groq", name: "Groq (free tier)", model: "openai/gpt-oss-120b", link: "https://console.groq.com/keys" },
];
export type Img = { url: string; name: string };
