// Quantization formats and their storage cost per weight parameter.
// bytesPerParam is the average on-disk / in-VRAM cost of one weight,
// including the small overhead real quant schemes add for scales/zero-points.
export interface Quant {
  id: string;
  label: string;
  bytesPerParam: number;
  note: string;
}

export const QUANTS: Quant[] = [
  { id: "fp16", label: "FP16 / BF16", bytesPerParam: 2.0, note: "Full half precision — the reference weights." },
  { id: "fp8", label: "FP8", bytesPerParam: 1.0, note: "8-bit float, near-lossless on modern models." },
  { id: "int8", label: "INT8 / Q8", bytesPerParam: 1.0, note: "8-bit integer, very small quality hit." },
  { id: "q6", label: "Q6_K", bytesPerParam: 0.82, note: "6-bit k-quant, popular sweet spot." },
  { id: "q5", label: "Q5_K_M", bytesPerParam: 0.69, note: "5-bit k-quant, strong quality/size trade." },
  { id: "q4", label: "Q4_K_M", bytesPerParam: 0.56, note: "4-bit k-quant — the default for local runs." },
  { id: "mxfp4", label: "MXFP4", bytesPerParam: 0.53, note: "Microscaling 4-bit float; Kimi K3 ships native in it." },
  { id: "q3", label: "Q3_K_M", bytesPerParam: 0.43, note: "3-bit — noticeable degradation, use with care." },
  { id: "q2", label: "Q2_K", bytesPerParam: 0.33, note: "2-bit — smallest, meaningful quality loss." },
];

export function quantById(id: string): Quant {
  const q = QUANTS.find((x) => x.id === id);
  if (!q) throw new Error(`unknown quant: ${id}`);
  return q;
}
