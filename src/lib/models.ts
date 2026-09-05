// Model presets. Numbers marked "estimated" in the UI note are best-effort where
// a brand-new model's full architecture is not yet public — every field is
// editable so you can correct it. The calculator math is exact; only these
// starting inputs carry uncertainty.
export interface ModelSpec {
  id: string;
  name: string;
  totalParamsB: number; // billions — ALL weights that must be resident in VRAM
  activeParamsB: number; // billions — params actually used per token (== total for dense)
  isMoE: boolean;
  layers: number;
  hiddenSize: number; // d_model
  gqaFactor: number; // heads / kv_heads — how much GQA shrinks the KV cache (1 = full MHA)
  defaultCtx: number; // tokens
  maxCtx: number;
  released: string;
  note: string;
}

export const MODELS: ModelSpec[] = [
  {
    id: "kimi-k3",
    name: "Kimi K3 (Moonshot)",
    totalParamsB: 2800,
    activeParamsB: 32,
    isMoE: true,
    layers: 72,
    hiddenSize: 8192,
    gqaFactor: 8,
    defaultCtx: 8192,
    maxCtx: 1_000_000,
    released: "2026-07-16",
    note: "2.8T total / ~32B active (16 of 896 experts). Ships natively in MXFP4. KDA attention cuts KV ~75%; layer counts here are estimated.",
  },
  {
    id: "longcat-2",
    name: "LongCat-2.0",
    totalParamsB: 1600,
    activeParamsB: 48,
    isMoE: true,
    layers: 64,
    hiddenSize: 8192,
    gqaFactor: 8,
    defaultCtx: 8192,
    maxCtx: 256_000,
    released: "2026-07",
    note: "One of the largest openly downloadable MoE releases of the week: 1.6T total, ~48B active. Architecture fields estimated.",
  },
  {
    id: "llama4-405b",
    name: "Llama-class 405B (dense)",
    totalParamsB: 405,
    activeParamsB: 405,
    isMoE: false,
    layers: 126,
    hiddenSize: 16384,
    gqaFactor: 8,
    defaultCtx: 8192,
    maxCtx: 128_000,
    released: "—",
    note: "A large dense model: every parameter is active every token, so weights and compute cost both scale with the full 405B.",
  },
  {
    id: "qwen-72b",
    name: "Qwen-class 72B (dense)",
    totalParamsB: 72,
    activeParamsB: 72,
    isMoE: false,
    layers: 80,
    hiddenSize: 8192,
    gqaFactor: 8,
    defaultCtx: 8192,
    maxCtx: 128_000,
    released: "—",
    note: "The classic 'can I run a 70B?' target. Dense, GQA attention.",
  },
  {
    id: "gpt-oss-120b",
    name: "GPT-OSS 120B (MoE)",
    totalParamsB: 120,
    activeParamsB: 5.1,
    isMoE: true,
    layers: 36,
    hiddenSize: 5760,
    gqaFactor: 8,
    defaultCtx: 8192,
    maxCtx: 128_000,
    released: "—",
    note: "An open-weight MoE: 120B resident, only ~5B active per token — cheap to run once it fits.",
  },
  {
    id: "phi-mini-4b",
    name: "Phi-class 4B (dense)",
    totalParamsB: 3.8,
    activeParamsB: 3.8,
    isMoE: false,
    layers: 32,
    hiddenSize: 3072,
    gqaFactor: 3,
    defaultCtx: 8192,
    maxCtx: 128_000,
    released: "—",
    note: "A small model that fits almost anywhere — the baseline for edge / single-consumer-GPU deployment.",
  },
];

export function modelById(id: string): ModelSpec {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown model: ${id}`);
  return m;
}
