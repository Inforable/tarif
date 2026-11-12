// Models the owner can pick for the agent. All support tool calling and structured outputs.

export const MODELS = [
  { id: "gpt-5-mini", label: "GPT-5 mini", note: "Balanced. Default." },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", note: "Newer, fast reasoning." },
  { id: "gpt-5.5", label: "GPT-5.5", note: "Deepest reasoning, slower." },
  { id: "gpt-4.1", label: "GPT-4.1", note: "No reasoning step, quickest." },
] as const;

export const DEFAULT_MODEL = "gpt-5-mini";

export function isKnownModel(id: string) {
  return MODELS.some((m) => m.id === id);
}

export function modelLabel(id: string) {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}
