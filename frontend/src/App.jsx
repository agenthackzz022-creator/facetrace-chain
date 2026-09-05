import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, Check, ChevronRight, CircleDot,
  Database, ExternalLink, Fingerprint, Globe2, Link2, Loader2,
  RotateCcw, ScanFace, Search, ShieldCheck, Sparkles, Upload, Zap
} from "lucide-react";

const API = "http://localhost:8000";

const STEPS = [
  ["face", "Face scan", "Detect the face"],
  ["encoding", "Face encoding", "Create the biometric vector"],
  ["search", "Web discovery", "Find public indexed matches"],
  ["match", "Match analysis", "Compare available faces"],
  ["chain", "Blockchain", "Record and verify evidence"],
];

function scoreLabel(score) {
  if (score == null) return "Not available";
  if (score >= 85) return "High similarity";
  if (score >= 70) return "Moderate similarity";
  return "Low similarity";
}

function domainOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return "web result"; }
}

function displayUrl(value) {
  if (!value) return "No source link returned";
  try {
    const u = new URL(value);
    const path = u.pathname === "/" ? "" : u.pathname;
    const clean = `${u.hostname}${path}`;
    return clean.length > 58 ? `${clean.slice(0, 55)}…` : clean;
  } catch {
    return value.length > 58 ? `${value.slice(0, 55)}…` : value;
  }
}

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(0);
  const [chain, setChain] = useState(null);
  const [verification, setVerification] = useState(null);
  const [chainError, setChainError] = useState("");
  const [analysisMs, setAnalysisMs] = useState(null);
  const [scanFrame, setScanFrame] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => setScanFrame((v) => (v + 1) % 100), 45);
    return () => window.clearInterval(id);
  }, [loading]);

  function chooseFile(next) {
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("The original image must be smaller than 10MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setError("");
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setChainError("");
    setData(null);
    setChain(null);
    setVerification(null);
    setAnalysisMs(null);
    setStage("face");

    const fd = new FormData();
    fd.append("file", file);
    const started = performance.now();

    try {
      // The existing backend exposes /api/analyze plus separate blockchain endpoints.
      // Keep the polished UI, but use those real endpoints instead of assuming
      // blockchain fields are returned by /api/analyze.
      const resPromise = fetch(`${API}/api/analyze`, { method: "POST", body: fd });
      setTimeout(() => setStage("encoding"), 350);
      setTimeout(() => setStage("search"), 850);
      setTimeout(() => setStage("match"), 2200);

      const res = await resPromise;
      let json;
      try { json = await res.json(); }
      catch { throw new Error(`The backend returned an invalid response (HTTP ${res.status}).`); }
      if (!res.ok) throw new Error(json.detail || "Image analysis failed.");

      setData(json);
      setSelected(0);
      setAnalysisMs(Math.round(performance.now() - started));

      const results = json.search?.results || [];
      if (!results.length) {
        setStage("match");
        return;
      }

      // Automatically record the best returned result using the backend's
      // real registration endpoint.
      setStage("chain");
      const registerRes = await fetch(`${API}/api/evidence/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: json.record_id,
          result_index: 0,
        }),
      });

      let registerJson;
      try { registerJson = await registerRes.json(); }
      catch { throw new Error(`Blockchain registration returned an invalid response (HTTP ${registerRes.status}).`); }

      if (!registerRes.ok) {
        throw new Error(registerJson.detail || "Blockchain recording failed.");
      }

      setChain(registerJson);

      // Immediately re-read the record from Anvil and verify all hashes.
      const verifyRes = await fetch(`${API}/api/evidence/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: json.record_id,
          evidence_id: registerJson.evidence_id,
        }),
      });

      let verifyJson;
      try { verifyJson = await verifyRes.json(); }
      catch { throw new Error(`Blockchain verification returned an invalid response (HTTP ${verifyRes.status}).`); }

      if (!verifyRes.ok) {
        throw new Error(verifyJson.detail || "Blockchain verification failed.");
      }

      setVerification(verifyJson);
      setStage(verifyJson.verified ? "complete" : "chain");
    } catch (e) {
      const message = e.message || "Could not connect to the backend.";
      setError(message);
      if (data?.record_id) setChainError(message);
      setStage("chain");
    } finally {
      setLoading(false);
      setAnalysisMs((current) => current ?? Math.round(performance.now() - started));
    }
  }

  async function recordEvidence() {
    if (!data?.record_id || !(data.search?.results || []).length) return;
    setLoading(true);
    setStage("chain");
    setError("");
    setChainError("");

    try {
        const res = await fetch(`${API}/api/evidence/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: data.record_id,
          result_index: selected,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Blockchain recording failed.");
      setChain(json);

      const verifyRes = await fetch(`${API}/api/evidence/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: data.record_id,
          evidence_id: json.evidence_id,
        }),
      });
      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJson.detail || "Blockchain verification failed.");
      setVerification(verifyJson);
      setStage(verifyJson.verified ? "complete" : "chain");
    } catch (e) {
      const message = e.message || "Blockchain recording failed.";
      setError(message);
      setChainError(message);
      setStage("chain");
    } finally {
      setLoading(false);
    }
  }

  async function verifyEvidence() {
    if (!chain?.evidence_id || !data?.record_id) return;
    setLoading(true);
    setStage("chain");
    setError("");

    try {
      const res = await fetch(`${API}/api/evidence/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: data.record_id,
          evidence_id: chain.evidence_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Verification failed.");
      setVerification(json);
      setStage(json.verified ? "complete" : "chain");
    } catch (e) {
      setError(e.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(""); setData(null); setChain(null); setVerification(null); setChainError(""); setError(""); setStage(""); setAnalysisMs(null); setSelected(0);
  }

  const results = data?.search?.results || [];
  const current = results[selected] || results[0];
  const processed = results.filter((r) => r.face_similarity != null);
  const bestProcessed = useMemo(() => processed[0], [processed]);

  if (!data) {
    return (
      <div className="app-shell landing-shell">
        <Background />
        <Header compact />
        <main className="landing-main">
          <div className="goa-kicker"><span className="kicker-dot" /> HH GOA 2026 <b>•</b> TASK 03</div>
          <h1>Face discovery.<br /><span>Verified on-chain.</span></h1>
          <p className="hero-copy">
            Scan a face, discover public web matches, compare available candidate images, and create a tamper-evident blockchain record — in one clean pipeline.
          </p>

          <div
            className={`upload-card ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files[0]); }}
          >
            <div className="upload-glow" />
            {!preview ? (
              <div className="upload-empty">
                <div className="scan-icon"><ScanFace size={28} /></div>
                <div className="upload-label">DROP IMAGE TO BEGIN</div>
                <h2>Start an evidence scan</h2>
                <p>Drag an image here, or select one from your computer.</p>
                <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
                  <Upload size={16} /> Choose image <ArrowUpRight size={14} />
                </button>
                <div className="format-row"><span>JPG</span><span>PNG</span><span>WEBP</span><span>MAX 10MB</span></div>
              </div>
            ) : (
              <div className="upload-selected">
                <div className="selected-preview-wrap">
                  <img src={preview} className="selected-preview" alt="Selected upload" />
                  <div className="preview-badge"><CircleDot size={11} /> READY</div>
                </div>
                <div className="selected-info">
                  <div className="eyebrow">INPUT IMAGE</div>
                  <h2>{file.name}</h2>
                  <p>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready for analysis</p>
                  <div className="selected-actions">
                    <button className="btn btn-primary" onClick={analyze} disabled={loading}>
                      {loading ? <Loader2 className="spin" size={16} /> : <Zap size={16} />}
                      {loading ? "Scanning…" : "Analyze image"}
                    </button>
                    <button className="btn btn-quiet" onClick={reset}>Remove</button>
                  </div>
                </div>
              </div>
            )}
            <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => chooseFile(e.target.files[0])} />
          </div>

          <div className="feature-strip">
            <Feature icon={<ScanFace />} title="Face scan" text="Detect + encode" />
            <Feature icon={<Globe2 />} title="Web discovery" text="Live reverse search" />
            <Feature icon={<ShieldCheck />} title="Evidence" text="Hash + verify" />
          </div>

          <div className="signal-note"><Sparkles size={13} /> Less noise. More signal. <span>Built as a focused Task #3 pipeline.</span></div>
          {error && <ErrorBox text={error} />}
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-shell results-shell">
      <Background />
      <Header />
      <main className="results-main">
        <div className="results-top">
          <div>
            <div className="goa-kicker"><span className="kicker-dot" /> LIVE INVESTIGATION</div>
            <h1>Investigation results</h1>
            <p>One pipeline from face scan to verifiable evidence{analysisMs != null ? ` · ${((analysisMs || 0) / 1000).toFixed(1)}s` : ""}</p>
          </div>
          <button className="btn btn-quiet" onClick={reset}><RotateCcw size={15} /> Analyze another</button>
        </div>

        <Pipeline data={data} stage={stage} chain={chain} />

        <div className="summary-row">
          <Summary label="Faces" value={data.face_count ?? 0} icon={<ScanFace />} />
          <Summary label="Web results" value={results.length} icon={<Globe2 />} />
          <Summary label="Face-compared" value={processed.length} icon={<Fingerprint />} />
          <Summary label="Blockchain" value={verification?.verified ? "Verified" : chain ? "Recorded" : "Waiting"} icon={<Link2 />} />
        </div>

        <section className="panel-grid">
          <Panel icon={<ScanFace />} number="01" title="Face input" subtitle="What we detected from your image">
            <div className="face-card">
              <img src={preview} alt="Input" />
              <div className="face-data">
                <div className="status-pill success"><Check size={13} /> FACE DETECTED</div>
                <DataRow label="Faces detected" value={data.face_count} />
                <DataRow label="Embedding" value={data.face_count ? `${data.face[0].embedding_dimension}D` : "—"} />
                <DataRow label="Detection confidence" value={data.face_count ? `${(data.face[0].detection_score * 100).toFixed(1)}%` : "—"} />
              </div>
            </div>
          </Panel>

          <Panel icon={<Fingerprint />} number="02" title="Evidence fingerprint" subtitle="Cryptographic fingerprints for this run">
            <HashBox title="ORIGINAL IMAGE · SHA-256" value={data.fingerprint.image_hash} />
            <HashBox title="SEARCH METADATA · SHA-256" value={data.fingerprint.metadata_hash} />
          </Panel>
        </section>

        <section className="panel discovery-panel">
          <PanelHeading icon={<Globe2 />} number="03" title="Web discovery" subtitle="Live reverse-image results from publicly indexed content" right={<span className="result-count">{results.length} results</span>} />
          {data.search.error ? <div className="inline-alert"><AlertTriangle size={14} /> {data.search.error}</div> : null}
          {results.length === 0 ? (
            <Empty icon={<Search />} title="No web results found" text="The search provider returned no indexed image matches for this upload." />
          ) : (
            <div className="discovery-layout">
              <div className="result-list">
                {results.map((r, i) => (
                  <button key={`${r.link}-${i}`} className={`result-card ${selected === i ? "selected" : ""}`} onClick={() => setSelected(i)}>
                    {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <div className="result-thumb-empty"><Database size={17} /></div>}
                    <div className="result-copy">
                      <div className="result-meta"><span>{r.source || domainOf(r.link)}</span><em>{r.type === "exact_match" ? "EXACT MATCH" : "VISUAL MATCH"}</em></div>
                      <strong>{r.title || "Untitled web result"}</strong>
                      <span className="result-url" title={r.link || "No source link returned"}>{displayUrl(r.link)}</span>
                      {r.face_similarity != null && <span className="mini-sim">FACE SIMILARITY {r.face_similarity}%</span>}
                    </div>
                    <ChevronRight className="result-arrow" size={16} />
                  </button>
                ))}
              </div>

              <div className="result-detail">
                {current?.thumbnail ? <img src={current.thumbnail} className="detail-image" alt="Discovered result" /> : <div className="detail-image detail-empty"><Database size={30} /></div>}
                <div className="detail-body">
                  <div className="result-meta"><span>{current?.source || domainOf(current?.link)}</span><em>{current?.type === "exact_match" ? "EXACT MATCH" : "VISUAL MATCH"}</em></div>
                  <h3>{current?.title || "Untitled web result"}</h3>
                  <p>{current?.snippet || "No description was returned for this result."}</p>
                  <div className="destination-box">
                    <span>DESTINATION</span>
                    <b>{domainOf(current?.link)}</b>
                    <small title={current?.link}>{displayUrl(current?.link)}</small>
                  </div>
                  <div className="detail-actions">
                    {current?.link && <a className="btn btn-quiet" href={current.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open source</a>}
                    {current?.face_similarity != null && <span className="detail-score"><Fingerprint size={14} /> {current.face_similarity}% face similarity</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="panel match-panel">
          <PanelHeading icon={<ScanFace />} number="04" title="Match analysis" subtitle="Only candidates that were successfully face-processed receive a score" />
          <div className="match-layout">
            <CompareCard label="INPUT IMAGE" src={preview} />
            <div className="match-score-center">
              <div className="score-ring" style={{ "--score": `${current?.face_similarity ?? 0}%` }}>
                <div><strong>{current?.face_similarity != null ? `${current.face_similarity}%` : "—"}</strong><span>FACE<br />SIMILARITY</span></div>
              </div>
              <b>{scoreLabel(current?.face_similarity)}</b>
              <small>{current?.face_similarity != null ? "Calculated from face embeddings." : "This candidate could not be face-compared."}</small>
            </div>
            <CompareCard label="DISCOVERED IMAGE" src={current?.thumbnail} />
          </div>
          <div className="disclaimer"><AlertTriangle size={14} /><span>Similarity is a model score, not proof of identity. It describes how similar two processed face embeddings are.</span></div>
        </section>

        <section className={`panel chain-panel ${verification?.verified ? "verified-panel" : ""}`}>
          <PanelHeading icon={<ShieldCheck />} number="05" title="Blockchain verification" subtitle="Evidence is recorded and checked automatically after a valid result is found" right={<span className={`chain-status ${verification?.verified ? "verified" : chain ? "recorded" : "pending"}`}><span /> {verification?.verified ? "VERIFIED" : chain ? "RECORDED" : "PENDING"}</span>} />

          {chain ? (
            <>
              <div className="chain-hero">
                <div className="chain-check"><ShieldCheck size={25} /></div>
                <div><b>{verification?.verified ? "Evidence verified on-chain" : "Evidence recorded"}</b><span>{verification?.verified ? "All local fingerprints match the stored blockchain record." : "The transaction was confirmed in the local Anvil chain."}</span></div>
                <div className="chain-live"><span /> ANVIL NODE</div>
              </div>
              <div className="chain-grid">
                <ChainValue label="EVIDENCE ID" value={chain.evidence_id} />
                <ChainValue label="BLOCK" value={chain.block_number} />
                <ChainValue label="TRANSACTION" value={chain.transaction_hash} />
                <ChainValue label="CONTRACT" value={chain.contract_address} />
              </div>
              <div className="verification-grid">
                <VerifyItem label="Image hash" ok={verification?.verified} />
                <VerifyItem label="Metadata hash" ok={verification?.verified} />
                <VerifyItem label="Evidence hash" ok={verification?.verified} />
              </div>
              <div className="chain-actions">
                <span className="recorded-note">Evidence is linked to the selected web result at the time of recording.</span>
                <button className="btn btn-quiet" onClick={verifyEvidence} disabled={loading || !chain.evidence_id}>
                  {loading ? <Loader2 className="spin" size={14}/> : <ShieldCheck size={14}/>} Re-verify
                </button>
              </div>
            </>
          ) : (
            <div className="chain-pending">
              <div className="pending-orbit"><Link2 size={22} /></div>
              <div>
                <b>{chainError ? "Automatic blockchain registration needs attention" : "Preparing blockchain evidence"}</b>
                <p>{chainError || "The best available result is being prepared for automatic recording."}</p>
              </div>
              {results.length > 0 && chainError && (
                <button className="btn btn-primary" onClick={recordEvidence} disabled={loading}>
                  {loading ? <Loader2 className="spin" size={14}/> : <Link2 size={14}/>} Retry
                </button>
              )}
            </div>
          )}
          {error && <ErrorBox text={error} />}
        </section>

        <div className="bottom-note"><ShieldCheck size={14} /> Local verification node · Evidence is tamper-evident, not an identity claim.</div>
      </main>
      <Footer />
      {loading && <ScanOverlay preview={preview} stage={stage} progress={scanFrame} />}
    </div>
  );
}

function Background() {
  return <div className="background" aria-hidden="true"><div className="grid-lines" /><div className="sun-glow" /><div className="ocean-glow" /><div className="noise" /></div>;
}

function Header({ compact = false }) {
  return <header className="topbar"><div className="brand"><div className="brand-symbol"><ScanFace size={18} /></div><div><strong>FaceTrace Chain</strong><small>FACE · WEB · EVIDENCE</small></div></div><div className="header-right"><span className="goa-tag">GOA / INDIA</span><span className="node-dot" /><span className="online-label">LOCAL NODE ONLINE</span>{!compact && <span className="header-code">FT·03</span>}</div></header>;
}

function Footer() {
  return <footer className="footer"><span>FACETRACE CHAIN</span><span>HH GOA 2026 · TASK #3</span><span>BUILD · SHIP · VERIFY</span></footer>;
}

function Feature({ icon, title, text }) { return <div className="feature"><span>{icon}</span><div><b>{title}</b><small>{text}</small></div></div>; }
function Summary({ icon, label, value }) { return <div className="summary"><span className="summary-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>; }
function DataRow({ label, value }) { return <div className="data-row"><span>{label}</span><b>{value}</b></div>; }
function HashBox({ title, value }) { return <div className="hash-box"><span>{title}</span><code>{value}</code></div>; }
function ChainValue({ label, value }) { return <div className="chain-value"><span>{label}</span><code>{value}</code></div>; }
function VerifyItem({ label, ok }) { return <div className={`verify-item ${ok ? "ok" : "pending"}`}><span>{ok ? <Check size={14} /> : <Loader2 className="spin" size={14} />}</span><b>{label}</b><small>{ok ? "MATCH" : "WAITING"}</small></div>; }
function Empty({ icon, title, text }) { return <div className="empty-state">{icon}<b>{title}</b><p>{text}</p></div>; }
function ErrorBox({ text }) { return <div className="error-box"><AlertTriangle size={15} /> <span>{text}</span></div>; }

function Panel({ icon, number, title, subtitle, children }) { return <section className="panel"><PanelHeading icon={icon} number={number} title={title} subtitle={subtitle} />{children}</section>; }
function PanelHeading({ icon, number, title, subtitle, right }) { return <div className="panel-heading"><div className="heading-left"><span className="panel-icon">{icon}</span><span className="panel-number">{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>{right}</div>; }

function Pipeline({ data, stage, chain }) {
  const complete = (key) => {
    if (key === "face") return data.face_count > 0;
    if (key === "encoding") return data.face_count > 0;
    if (key === "search") return !data.search.error;
    if (key === "match") return (data.search.results || []).length > 0;
    if (key === "chain") return !!chain || !!data.verification?.verified;
    return false;
  };
  return <div className="pipeline-bar">{STEPS.map(([key, title, desc], i) => <div className={`pipeline-step ${complete(key) ? "done" : ""} ${stage === key ? "active" : ""}`} key={key}><div className="pipeline-node">{complete(key) ? <Check size={13} /> : stage === key ? <Loader2 className="spin" size={13} /> : <span>{String(i + 1).padStart(2, "0")}</span>}</div><div><b>{title}</b><small>{desc}</small></div>{i < STEPS.length - 1 && <span className="pipeline-line" />}</div>)}</div>;
}

function CompareCard({ label, src }) { return <div className="compare-card"><span>{label}</span>{src ? <img src={src} alt={label} /> : <div className="compare-empty"><ScanFace size={22} /><small>Image unavailable</small></div>}</div>; }

function ScanOverlay({ preview, stage, progress }) {
  const activeIndex = Math.max(0, STEPS.findIndex((s) => s[0] === stage));
  return <div className="scan-overlay"><div className="scan-modal"><div className="scan-top"><span><span className="node-dot" /> LIVE SCAN</span><code>HHG·03 / 0x{progress.toString(16).padStart(2, "0")}</code></div><div className="scan-visual"><img src={preview} alt="Scanning" /><div className="scan-vignette" /><div className="scan-grid" /><div className="scan-corners" /><div className="scan-line" style={{ top: `${10 + (progress * .78)}%` }} /><div className="scan-face-frame"><span /><i /><b /></div><div className="scan-target">FACE VECTOR</div></div><div className="scan-copy"><div className="scan-eyebrow">PROCESSING · STEP {String(activeIndex + 1).padStart(2, "0")}</div><h2>{STEPS[activeIndex]?.[1] || "Analyzing image"}</h2><p>{STEPS[activeIndex]?.[2] || "Working through the evidence pipeline."}</p></div><div className="scan-steps">{STEPS.map(([key, title], i) => <div className={i <= activeIndex ? "on" : ""} key={key}><span>{i < activeIndex ? <Check size={11} /> : i === activeIndex ? <Loader2 className="spin" size={11} /> : i + 1}</span>{title}</div>)}</div><div className="scan-progress"><span style={{ width: `${Math.min(96, Math.max(8, ((activeIndex + 1) / STEPS.length) * 100 + 8))}%` }} /></div><small className="scan-note">Analyzing locally and querying public indexed sources. Blockchain evidence is generated automatically after a valid result.</small></div></div>;
}

export default App;
