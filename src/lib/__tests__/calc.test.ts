import { describe, it, expect } from "vitest";
import { memoryFootprint, evaluateFit, throughput } from "../calc";
import { modelById, MODELS } from "../models";
import { quantById, QUANTS } from "../quant";
import { HARDWARE, nodeVram } from "../hardware";

const q = (id: string) => quantById(id);
const m = (id: string) => modelById(id);
const hw = (id: string) => {
  const h = HARDWARE.find((x) => x.id === id);
  if (!h) throw new Error(id);
  return h;
};

describe("memoryFootprint — weights", () => {
  it("dense 72B at FP16 needs ~144GB of weights", () => {
    const mem = memoryFootprint(m("qwen-72b"), q("fp16"), 8192, 1);
    expect(mem.weightsGB).toBeGreaterThan(140);
    expect(mem.weightsGB).toBeLessThan(150);
  });

  it("72B at Q4 roughly quarters the weight memory vs FP16", () => {
    const fp16 = memoryFootprint(m("qwen-72b"), q("fp16"), 8192, 1);
    const q4 = memoryFootprint(m("qwen-72b"), q("q4"), 8192, 1);
    expect(q4.weightsGB).toBeLessThan(fp16.weightsGB * 0.35);
  });

  it("MoE weights use TOTAL params, not active — Kimi K3 is enormous even in MXFP4", () => {
    const mem = memoryFootprint(m("kimi-k3"), q("mxfp4"), 8192, 1);
    // 2800B * 0.53 bytes ≈ 1484 GB — far more than any single GPU.
    expect(mem.weightsGB).toBeGreaterThan(1400);
    expect(mem.weightsGB).toBeLessThan(1600);
  });
});

describe("memoryFootprint — KV cache", () => {
  it("KV cache grows linearly with context length", () => {
    const short = memoryFootprint(m("qwen-72b"), q("q4"), 4096, 1);
    const long = memoryFootprint(m("qwen-72b"), q("q4"), 8192, 1);
    // double the context ⇒ double the KV cache (within rounding).
    expect(long.kvCacheGB / short.kvCacheGB).toBeCloseTo(2, 1);
  });

  it("KV cache scales with batch size", () => {
    const b1 = memoryFootprint(m("qwen-72b"), q("q4"), 8192, 1);
    const b4 = memoryFootprint(m("qwen-72b"), q("q4"), 8192, 4);
    expect(b4.kvCacheGB).toBeCloseTo(b1.kvCacheGB * 4, 1);
  });

  it("total = weights + kv + overhead", () => {
    const mem = memoryFootprint(m("qwen-72b"), q("q4"), 8192, 1);
    expect(mem.totalGB).toBeCloseTo(mem.weightsGB + mem.kvCacheGB + mem.overheadGB, 1);
  });
});

describe("evaluateFit", () => {
  it("a 4B model fits comfortably on a single 4090 with headroom", () => {
    const mem = memoryFootprint(m("phi-mini-4b"), q("q4"), 8192, 1);
    const fit = evaluateFit(mem, m("phi-mini-4b"), q("q4"), hw("rtx4090"));
    expect(fit.verdict).toBe("fits");
    expect(fit.gpusNeeded).toBe(1);
    expect(fit.headroomPct).toBeGreaterThan(10);
  });

  it("Kimi K3 cannot fit on a single H100 (verdict: no)", () => {
    const mem = memoryFootprint(m("kimi-k3"), q("mxfp4"), 8192, 1);
    const fit = evaluateFit(mem, m("kimi-k3"), q("mxfp4"), hw("h100"));
    expect(fit.verdict).toBe("no");
    expect(fit.gpusNeeded).toBeGreaterThan(1);
    expect(fit.tokensPerSec).toBe(0);
  });

  it("even an 8×MI300X Azure node (1536GB) can't hold Kimi K3 at MXFP4 once overhead is counted", () => {
    const mem = memoryFootprint(m("kimi-k3"), q("mxfp4"), 8192, 1);
    const fit = evaluateFit(mem, m("kimi-k3"), q("mxfp4"), hw("az-nd-mi300x"));
    // ~1484GB weights + ~10% overhead > 8×192 = 1536GB — a genuine, non-obvious result.
    expect(fit.verdict).toBe("no");
    expect(fit.gpusNeeded).toBeGreaterThan(8);
  });

  it("a dense 405B at FP16 fits across an 8×H200 node by spreading over multiple GPUs (verdict: multi)", () => {
    const mem = memoryFootprint(m("llama4-405b"), q("fp16"), 8192, 1);
    const fit = evaluateFit(mem, m("llama4-405b"), q("fp16"), hw("az-nd-h200"));
    // ~810GB weights + overhead fits within 8×141 = 1128GB, but needs several GPUs.
    expect(fit.verdict).toBe("multi");
    expect(fit.gpusNeeded).toBeGreaterThan(1);
    expect(fit.tokensPerSec).toBeGreaterThan(0);
  });

  it("nodeVram multiplies unit VRAM by accelerator count", () => {
    expect(nodeVram(hw("az-nd-h100"))).toBe(640);
  });
});

describe("throughput", () => {
  it("MoE active-param advantage: GPT-OSS 120B decodes far faster than dense 405B on the same GPU", () => {
    const moe = throughput(m("gpt-oss-120b"), q("q4"), hw("h100"), 1);
    const dense = throughput(m("llama4-405b"), q("q4"), hw("h100"), 1);
    expect(moe).toBeGreaterThan(dense * 5);
  });

  it("higher-bandwidth GPU yields higher tok/s for the same model", () => {
    const onH100 = throughput(m("qwen-72b"), q("q4"), hw("h100"), 1);
    const onA100 = throughput(m("qwen-72b"), q("q4"), hw("a100-80"), 1);
    expect(onH100).toBeGreaterThan(onA100);
  });
});

describe("data integrity", () => {
  it("every model has positive, sane params", () => {
    for (const model of MODELS) {
      expect(model.totalParamsB).toBeGreaterThan(0);
      expect(model.activeParamsB).toBeGreaterThan(0);
      expect(model.activeParamsB).toBeLessThanOrEqual(model.totalParamsB);
      if (!model.isMoE) expect(model.activeParamsB).toBe(model.totalParamsB);
    }
  });

  it("quant bytes-per-param decrease monotonically down the list", () => {
    for (let i = 1; i < QUANTS.length; i++) {
      expect(QUANTS[i].bytesPerParam).toBeLessThanOrEqual(QUANTS[i - 1].bytesPerParam);
    }
  });
});
