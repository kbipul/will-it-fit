// GPU and Azure VM targets. vramGB / bandwidthTBs are per single accelerator;
// count is how many sit in the node. Datacenter + Azure figures are the public
// published specs (H100 SXM 80GB@3.35TB/s, H200 141GB@4.8TB/s, MI300X 192GB@5.3TB/s).
export interface Hardware {
  id: string;
  name: string;
  category: "Consumer" | "Datacenter" | "Azure VM";
  vramGB: number; // per accelerator
  bandwidthTBs: number; // per accelerator, TB/s
  count: number; // accelerators in the node
  note?: string;
}

export const HARDWARE: Hardware[] = [
  { id: "rtx4090", name: "RTX 4090", category: "Consumer", vramGB: 24, bandwidthTBs: 1.008, count: 1 },
  { id: "rtx5090", name: "RTX 5090", category: "Consumer", vramGB: 32, bandwidthTBs: 1.79, count: 1 },
  { id: "a100-40", name: "A100 40GB", category: "Datacenter", vramGB: 40, bandwidthTBs: 1.555, count: 1 },
  { id: "a100-80", name: "A100 80GB", category: "Datacenter", vramGB: 80, bandwidthTBs: 2.039, count: 1 },
  { id: "h100", name: "H100 SXM", category: "Datacenter", vramGB: 80, bandwidthTBs: 3.35, count: 1 },
  { id: "h200", name: "H200", category: "Datacenter", vramGB: 141, bandwidthTBs: 4.8, count: 1 },
  { id: "mi300x", name: "AMD MI300X", category: "Datacenter", vramGB: 192, bandwidthTBs: 5.3, count: 1 },
  { id: "az-nc-a100", name: "Azure NC A100 v4 (4×A100 80GB)", category: "Azure VM", vramGB: 80, bandwidthTBs: 2.039, count: 4 },
  { id: "az-nd-h100", name: "Azure ND H100 v5 (8×H100)", category: "Azure VM", vramGB: 80, bandwidthTBs: 3.35, count: 8 },
  { id: "az-nd-h200", name: "Azure ND H200 v6 (8×H200)", category: "Azure VM", vramGB: 141, bandwidthTBs: 4.8, count: 8 },
  { id: "az-nd-mi300x", name: "Azure ND MI300X v5 (8×MI300X)", category: "Azure VM", vramGB: 192, bandwidthTBs: 5.3, count: 8 },
];

export function nodeVram(hw: Hardware): number {
  return hw.vramGB * hw.count;
}
