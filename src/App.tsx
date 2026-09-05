import { useMemo, useState } from "react";
import { MODELS, modelById } from "./lib/models";
import { QUANTS, quantById } from "./lib/quant";
import { HARDWARE, Hardware } from "./lib/hardware";
import { memoryFootprint, evaluateFit, FitVerdict } from "./lib/calc";

const CTX_STEPS = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 1_000_000];

const VERDICT_META: Record<FitVerdict, { label: string; cls: string }> = {
  fits: { label: "Fits", cls: "v-fits" },
  tight: { label: "Tight", cls: "v-tight" },
  multi: { label: "Multi-GPU", cls: "v-multi" },
  no: { label: "Won't fit", cls: "v-no" },
};

function fmtGB(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} TB`;
  if (n >= 100) return `${Math.round(n)} GB`;
  return `${n.toFixed(1)} GB`;
}
function fmtCtx(n: number): string {
  if (n >= 1_000_000) return "1M";
  if (n >= 1000) return `${Math.round(n / 1024)}K`;
  return `${n}`;
}
function fmtTok(n: number): string {
  if (n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

export function App() {
  const [modelId, setModelId] = useState("kimi-k3");
  const [quantId, setQuantId] = useState("mxfp4");
  const [ctxIdx, setCtxIdx] = useState(1); // 8192
  const [batch, setBatch] = useState(1);

  const model = modelById(modelId);
  const quant = quantById(quantId);
  const ctxLen = CTX_STEPS[ctxIdx];

  const mem = useMemo(
    () => memoryFootprint(model, quant, ctxLen, batch),
    [model, quant, ctxLen, batch]
  );

  const fits = useMemo(
    () => HARDWARE.map((hw) => evaluateFit(mem, model, quant, hw)),
    [mem, model, quant]
  );

  const grouped: Record<string, typeof fits> = { Consumer: [], Datacenter: [], "Azure VM": [] };
  for (const f of fits) grouped[f.hardware.category].push(f);

  const barMax = Math.max(mem.totalGB, 1);
  const wPct = (mem.weightsGB / barMax) * 100;
  const kPct = (mem.kvCacheGB / barMax) * 100;
  const oPct = (mem.overheadGB / barMax) * 100;

  const smallest = fits.filter((f) => f.verdict !== "no").sort((a, b) => a.nodeVramGB - b.nodeVramGB)[0];

  return (
    <div className="wrap">
      <header>
        <h1>Will It Fit?</h1>
        <p className="sub">
          The open-weight frontier is dropping giant models — <b>Kimi K3</b> (2.8T, weights
          on 27 Jul) and <b>LongCat-2.0</b> (1.6T). This asks the only question that matters
          before you provision anything: <b>can you actually run it, and how fast?</b> All math
          runs in your browser.
        </p>
      </header>

      <section className="controls">
        <div className="ctrl">
          <label>Model</label>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.isMoE ? `${m.totalParamsB}B / ${m.activeParamsB}B active` : `${m.totalParamsB}B`}
              </option>
            ))}
          </select>
        </div>
        <div className="ctrl">
          <label>Quantization</label>
          <select value={quantId} onChange={(e) => setQuantId(e.target.value)}>
            {QUANTS.map((qq) => (
              <option key={qq.id} value={qq.id}>
                {qq.label} · {qq.bytesPerParam} B/param
              </option>
            ))}
          </select>
        </div>
        <div className="ctrl">
          <label>
            Context <span className="pill">{fmtCtx(ctxLen)} tok</span>
          </label>
          <input
            type="range"
            min={0}
            max={CTX_STEPS.length - 1}
            value={ctxIdx}
            onChange={(e) => setCtxIdx(Number(e.target.value))}
          />
        </div>
        <div className="ctrl">
          <label>
            Batch <span className="pill">{batch}</span>
          </label>
          <input
            type="range"
            min={1}
            max={16}
            value={batch}
            onChange={(e) => setBatch(Number(e.target.value))}
          />
        </div>
      </section>

      <p className="modelnote">{model.note}</p>

      <section className="summary">
        <div className="total">
          <span className="totalnum">{fmtGB(mem.totalGB)}</span>
          <span className="totallbl">VRAM to serve</span>
        </div>
        <div className="bar">
          <div className="seg seg-w" style={{ width: `${wPct}%` }} title={`Weights ${fmtGB(mem.weightsGB)}`} />
          <div className="seg seg-k" style={{ width: `${kPct}%` }} title={`KV cache ${fmtGB(mem.kvCacheGB)}`} />
          <div className="seg seg-o" style={{ width: `${oPct}%` }} title={`Overhead ${fmtGB(mem.overheadGB)}`} />
        </div>
        <div className="legend">
          <span><i className="sw sw-w" /> Weights {fmtGB(mem.weightsGB)}</span>
          <span><i className="sw sw-k" /> KV cache {fmtGB(mem.kvCacheGB)}</span>
          <span><i className="sw sw-o" /> Overhead {fmtGB(mem.overheadGB)}</span>
        </div>
        {smallest ? (
          <p className="cheapest">
            Smallest target that fits: <b>{smallest.hardware.name}</b>
            {smallest.gpusNeeded > 1 ? ` (spread across ${smallest.gpusNeeded} accelerators)` : ""} · ~
            {fmtTok(smallest.tokensPerSec)} tok/s decode.
          </p>
        ) : (
          <p className="cheapest none">Nothing in the list holds this configuration — try a smaller quant or model.</p>
        )}
      </section>

      {model.isMoE && (
        <div className="insight">
          <b>MoE gotcha:</b> {model.name} is “{model.activeParamsB}B active”, but every one of its{" "}
          {model.totalParamsB}B parameters must sit in VRAM — only a subset <i>activate</i> per token.
          Weights are sized by the full {model.totalParamsB}B; decode speed rides the {model.activeParamsB}B
          active. That gap is why people badly under-provision MoE models.
        </div>
      )}

      <section className="grid">
        {(["Consumer", "Datacenter", "Azure VM"] as const).map((cat) => (
          <div key={cat} className="catcol">
            <h2>{cat}</h2>
            {grouped[cat].map((f) => (
              <HwCard key={f.hardware.id} f={f} hw={f.hardware} />
            ))}
          </div>
        ))}
      </section>

      <footer>
        <p>
          Estimates, not guarantees. Weights = total params × bytes/quant (all experts resident).
          KV cache = 2 × layers × (hidden ÷ GQA) × context × batch × 2 B. Decode tok/s is
          memory-bandwidth bound on the active params. Serving-engine choices (paged KV, KV
          quant, tensor-parallel comms) move the real numbers ±20%.
        </p>
      </footer>
    </div>
  );
}

function HwCard({ f, hw }: { f: ReturnType<typeof evaluateFit>; hw: Hardware }) {
  const meta = VERDICT_META[f.verdict];
  return (
    <div className={`hw ${meta.cls}`}>
      <div className="hwtop">
        <span className="hwname">{hw.name}</span>
        <span className="badge">{meta.label}</span>
      </div>
      <div className="hwmeta">
        <span>{hw.count > 1 ? `${hw.count}× ${hw.vramGB}GB = ${f.nodeVramGB}GB` : `${hw.vramGB}GB`}</span>
        <span>{fmtTok(f.tokensPerSec)} tok/s</span>
      </div>
      <div className="hwfoot">
        {f.verdict === "no"
          ? `needs ${f.gpusNeeded} of these`
          : f.verdict === "multi"
          ? `uses ${f.gpusNeeded} of ${hw.count} GPUs`
          : `${f.headroomPct}% VRAM free`}
      </div>
    </div>
  );
}
