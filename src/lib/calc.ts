import { ModelSpec } from "./models";
import { Quant } from "./quant";
import { Hardware, nodeVram } from "./hardware";

export interface MemoryBreakdown {
  weightsGB: number;
  kvCacheGB: number;
  overheadGB: number;
  totalGB: number;
}

// KV cache is stored in FP16 by default (2 bytes per element) unless the
// serving engine quantizes it.
const KV_BYTES_DEFAULT = 2;

/**
 * VRAM required to serve a model.
 *
 * Weights use TOTAL params — even in a Mixture-of-Experts model every expert
 * must be resident in memory, only a subset *activate* per token. This is the
 * single most misread number in "can I run it": Kimi K3 is "32B active" but you
 * still need to hold all 2.8T weights.
 */
export function memoryFootprint(
  model: ModelSpec,
  quant: Quant,
  ctxLen: number,
  batch: number,
  kvBytes: number = KV_BYTES_DEFAULT
): MemoryBreakdown {
  const weightsGB = (model.totalParamsB * 1e9 * quant.bytesPerParam) / 1e9;

  // KV cache: 2 tensors (K + V) × layers × kv-dim × ctx × batch × bytes.
  // kv-dim is the hidden size shrunk by the GQA grouping factor.
  const kvDim = model.hiddenSize / model.gqaFactor;
  const kvBytesTotal = 2 * model.layers * kvDim * ctxLen * batch * kvBytes;
  const kvCacheGB = kvBytesTotal / 1e9;

  // Activations + fragmentation + framework working set: ~10% of weights + ~1GB.
  const overheadGB = weightsGB * 0.1 + 1;

  const totalGB = weightsGB + kvCacheGB + overheadGB;
  return {
    weightsGB: round(weightsGB),
    kvCacheGB: round(kvCacheGB),
    overheadGB: round(overheadGB),
    totalGB: round(totalGB),
  };
}

export type FitVerdict = "fits" | "tight" | "multi" | "no";

export interface FitResult {
  hardware: Hardware;
  nodeVramGB: number;
  verdict: FitVerdict;
  gpusNeeded: number; // accelerators required to hold the model
  headroomPct: number; // % of node VRAM left free when it fits on the node
  tokensPerSec: number; // rough decode throughput estimate
}

/**
 * Decode throughput is memory-bandwidth bound: each generated token streams the
 * ACTIVE parameters through the accelerator once. So tok/s ≈ bandwidth /
 * (active-bytes). MoE wins here — Kimi K3 moves only ~32B of weights per token.
 * Multi-GPU tensor parallelism adds communication overhead, modelled at 0.7/gpu.
 */
export function throughput(model: ModelSpec, quant: Quant, hw: Hardware, gpusUsed: number): number {
  const activeBytes = model.activeParamsB * 1e9 * quant.bytesPerParam;
  const singleGpuBw = hw.bandwidthTBs * 1e12; // bytes/s
  const efficiency = gpusUsed <= 1 ? 0.8 : 0.7; // realized fraction of peak bandwidth
  const effectiveBw = singleGpuBw * gpusUsed * efficiency;
  return Math.round(effectiveBw / activeBytes);
}

export function evaluateFit(mem: MemoryBreakdown, model: ModelSpec, quant: Quant, hw: Hardware): FitResult {
  const node = nodeVram(hw);
  const gpusNeeded = Math.ceil(mem.totalGB / hw.vramGB);
  const fitsOnNode = mem.totalGB <= node;

  let verdict: FitVerdict;
  if (!fitsOnNode) {
    verdict = "no";
  } else if (gpusNeeded > 1) {
    verdict = "multi"; // fits, but only by spreading across GPUs in the node
  } else {
    const headroom = (node - mem.totalGB) / node;
    verdict = headroom < 0.1 ? "tight" : "fits";
  }

  const gpusUsed = Math.min(Math.max(gpusNeeded, 1), hw.count);
  const headroomPct = fitsOnNode ? round(((node - mem.totalGB) / node) * 100) : 0;
  const tokensPerSec = fitsOnNode ? throughput(model, quant, hw, gpusUsed) : 0;

  return { hardware: hw, nodeVramGB: node, verdict, gpusNeeded, headroomPct, tokensPerSec };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
