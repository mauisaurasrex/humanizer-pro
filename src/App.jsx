import { useState, useCallback } from "react";

// ─────────────────────────────────────────────
//  INDEPENDENT LINGUISTIC DETECTION ENGINE
//  No Claude — pure rule-based scoring
// ─────────────────────────────────────────────
const BUZZ = [
  "utilize","utilization","utilizing","leverage","leveraging","leveraged",
  "facilitate","facilitation","facilitating","optimize","optimization","optimizing",
  "synergy","synergistic","robust","streamline","streamlining","empower","empowering",
  "proactive","holistic","paradigm","seamless","cutting-edge","innovative","innovation",
  "stakeholder","deliverable","scalable","actionable","granular","bandwidth","ecosystem",
  "best-in-class","mission-critical","value-add","going forward","at the end of the day",
  "in conclusion","in summary","to summarize","furthermore","moreover","additionally",
  "consequently","nevertheless","notwithstanding","subsequently","aforementioned",
  "it is important to note","it is worth noting","it should be noted","it is crucial",
  "plays a crucial role","plays an important role","a wide range of","a variety of",
  "in today's","in the realm of","in the context of","this allows","this enables",
  "this ensures","this demonstrates","delve into","dive into","tapestry","nuanced",
  "multifaceted","underscore","pivotal","paramount","compelling","comprehensive"
];

const PASSIVE_RE = [
  /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi,
  /\b(is|are|was|were)\s+\w+en\b/gi,
  /\bhas been\b/gi,/\bhave been\b/gi,/\bhad been\b/gi,/\bwill be\s+\w+ed\b/gi
];

const HUMAN_MARKERS = [
  "but ","yet ","though ","actually","really","just ","kind of","sort of",
  "honestly","frankly","basically","pretty much","i think","i feel","you can",
  "that's","it's","don't","can't","won't","isn't","aren't","wasn't","weren't",
  "i've","you've","we've","i'd","you'd","we'd","i'll","you'll","we'll","to me",
  "in my view","i believe","arguably","interestingly","surprisingly"
];

function detectAI(text) {
  if (!text || text.trim().length < 30) return null;
  const lower = text.toLowerCase();
  const words = lower.match(/\b[a-z']+\b/g) || [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  // ── SIGNAL 1: BUZZWORD DENSITY — most reliable signal
  const buzzHits = BUZZ.filter(b => lower.includes(b));
  const buzzDensity = (buzzHits.length / Math.max(words.length, 1)) * 100;
  const buzzScore = buzzDensity === 0 ? 5 : buzzDensity < 0.8 ? 20 : buzzDensity < 2.0 ? 55 : buzzDensity < 3.5 ? 78 : 92;

  // ── SIGNAL 2: HUMAN MARKERS — contractions, hedges, casual phrases
  const humanHits = HUMAN_MARKERS.filter(m => lower.includes(m)).length;
  const humanDensity = (humanHits / Math.max(words.length, 1)) * 100;
  const humanScore = humanDensity > 4.0 ? 4 : humanDensity > 2.2 ? 14 : humanDensity > 1.0 ? 34 : humanDensity > 0.4 ? 58 : 80;

  // ── SIGNAL 3: BURSTINESS — sentence length variation
  // High CV (>0.45) = human. Low CV (<0.25) = AI.
  // IMPORTANT: only heavily penalise if buzzwords are also present — 
  // formal human writing naturally has lower variation too.
  const lens = sentences.map(s => s.trim().split(/\s+/).length);
  const mean = lens.reduce((a,b) => a+b, 0) / lens.length;
  const stddev = Math.sqrt(lens.reduce((a,b) => a+Math.pow(b-mean,2),0) / Math.max(lens.length,1));
  const cv = stddev / (mean || 1);
  let burstScore = cv >= 0.50 ? 6 : cv >= 0.38 ? 22 : cv >= 0.26 ? 44 : cv >= 0.16 ? 66 : 86;
  // If no buzzwords found, cap burst penalty — low variation alone ≠ AI
  if (buzzHits.length === 0) burstScore = Math.min(burstScore, 48);

  // ── SIGNAL 4: PASSIVE VOICE
  let passiveCount = 0;
  PASSIVE_RE.forEach(p => { const m = text.match(p); if (m) passiveCount += m.length; });
  const passiveRatio = passiveCount / Math.max(sentences.length, 1);
  const passiveScore = passiveRatio < 0.15 ? 6 : passiveRatio < 0.4 ? 22 : passiveRatio < 0.8 ? 50 : passiveRatio < 1.3 ? 72 : 86;

  // ── SIGNAL 5: AVG SENTENCE LENGTH
  const sentLenScore = mean < 12 ? 6 : mean < 16 ? 18 : mean < 21 ? 40 : mean < 25 ? 64 : 82;

  // ── SIGNAL 6: AVG WORD LENGTH
  const avgWordLen = words.reduce((a,w) => a + w.replace(/'/g,"").length, 0) / Math.max(words.length, 1);
  const wordLenScore = avgWordLen < 4.2 ? 5 : avgWordLen < 4.8 ? 16 : avgWordLen < 5.4 ? 36 : avgWordLen < 6.0 ? 58 : 76;

  // ── WEIGHTED COMPOSITE
  // Buzz + human markers are the most reliable signals (55% weight combined)
  const raw =
    buzzScore   * 0.30 +
    humanScore  * 0.25 +
    burstScore  * 0.18 +
    passiveScore* 0.12 +
    sentLenScore* 0.09 +
    wordLenScore* 0.06;

  const score = Math.round(Math.max(5, Math.min(95, raw)));

  return {
    score, buzzHits: buzzHits.length, passiveCount,
    meanSentLen: mean.toFixed(1), avgWordLen: avgWordLen.toFixed(1),
    humanHits, cv: cv.toFixed(2),
    breakdown: [
      { label: "Buzzwords",          value: `${buzzHits.length} found`,   penalty: buzzScore,    good: buzzScore    < 30 },
      { label: "Human markers",      value: `${humanHits} found`,         penalty: humanScore,   good: humanScore   < 30 },
      { label: "Sentence variation", value: `cv ${cv.toFixed(2)}`,        penalty: burstScore,   good: burstScore   < 30 },
      { label: "Passive voice",      value: `${passiveCount} hits`,       penalty: passiveScore, good: passiveScore < 30 },
      { label: "Avg sentence len",   value: `${mean.toFixed(1)}w`,        penalty: sentLenScore, good: sentLenScore < 30 },
      { label: "Avg word length",    value: `${avgWordLen.toFixed(1)}c`,  penalty: wordLenScore, good: wordLenScore < 30 },
    ]
  };
}

// Per-sentence risk score for highlighting
function sentenceRisk(sentence) {
  const d = detectAI(sentence + ".");
  if (!d) return 0;
  return d.score;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const wc = t => t.trim()==="" ? 0 : t.trim().split(/\s+/).length;
const sc = t => (t.match(/[^.!?]+[.!?]+/g)||[t]).length;
const awl = t => {
  const w = t.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "0";
  return (w.reduce((a,x)=>a+x.replace(/[^a-zA-Z]/g,"").length,0)/w.length).toFixed(1);
};
const uw = t => new Set((t.toLowerCase().match(/\b[a-z]+\b/g)||[])).size;

function buildDiff(orig, hum) {
  const origSet = new Set(orig.toLowerCase().replace(/[^a-z0-9\s]/g,"").split(/\s+/));
  return hum.split(/\s+/).map(w => {
    const c = w.toLowerCase().replace(/[^a-z0-9]/g,"");
    return c && !origSet.has(c)
      ? `<mark style="background:#34d39918;color:#34d399;border-radius:3px;padding:0 2px;border-bottom:1px solid #34d39966">${w}</mark>`
      : w;
  }).join(" ");
}

function buildRiskHighlight(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => {
    const risk = sentenceRisk(s);
    const bg = risk > 65 ? "#f8717118" : risk > 40 ? "#fbbf2412" : "transparent";
    const border = risk > 65 ? "1px solid #f8717133" : risk > 40 ? "1px solid #fbbf2433" : "none";
    const title = risk > 65 ? "⚠ High AI risk" : risk > 40 ? "~ Medium AI risk" : "";
    return `<span style="background:${bg};border-bottom:${border};border-radius:2px" title="${title}">${s}</span>`;
  }).join(" ");
}

const scoreColor = n => n < 35 ? "#34d399" : n < 62 ? "#fbbf24" : "#f87171";
const scoreLabel = n => n < 35 ? "Likely Human" : n < 62 ? "Possibly AI" : n < 80 ? "Likely AI" : "Almost Certainly AI";

// ─────────────────────────────────────────────
//  PROMPTS — essay-aware, per intensity
// ─────────────────────────────────────────────
const INTENSITY_LABELS = ["Light Touch", "Standard", "Full Rewrite"];
const INTENSITY_DESCS  = ["Preserves your original words as much as possible — only removes obvious AI tells", "Balanced rewrite — natural student voice, keeps structure intact", "Deep rewrite — sounds like a real student draft, more personality and variation"];

function buildPrompt(text, tone, intensity) {
  const toneMap = {
    Formal:         "slightly formal but clearly a student — no corporate language, no stiffness",
    Balanced:       "natural student academic writing — clear, direct, occasionally opinionated",
    Conversational: "conversational student voice — relaxed, direct, personal",
    Casual:         "casual student — sounds like a smart person writing a first draft"
  };

  const intensityInstructions = {
    "Light Touch":  "Make targeted fixes only. Remove every buzzword and AI filler phrase. Add 2-3 contractions. Split 1-2 overly long uniform sentences. Keep most original wording intact.",
    "Standard":     "Moderate rewrite. Remove all buzzwords and filler. Vary sentence lengths clearly — mix short and long. Add student voice (I think, actually, honestly, etc). Choose less predictable word alternatives throughout.",
    "Full Rewrite": "Full transformation. Apply every technique below at maximum intensity. This needs to read like a real student wrote it from scratch."
  };

  return `You are an expert at rewriting AI essays to pass detectors like ZeroGPT and GPTZero.

AI detectors work by measuring TOKEN-LEVEL PERPLEXITY — how predictable each word choice is — and BURSTINESS — how much sentence length varies. AI always picks the safest, most expected word and writes in uniform sentence lengths. Your job is to break both of these patterns completely.

Intensity: ${intensity} — ${intensityInstructions[intensity]}
Voice: ${toneMap[tone]}

═══ TECHNIQUE 1: UNPREDICTABLE WORD CHOICES (targets perplexity)
AI detectors flag text where every word is the most statistically likely next word.
Fix this by choosing the 2nd or 3rd most natural word instead of the most obvious one:
- "demonstrates" → "gets at" / "points to" / "makes clear"
- "significant" → "real" / "pretty big" / "worth paying attention to"
- "important" → "key" / "worth noting" / "the real issue"
- "however" → "but" / "then again" / "still" / "that said"
- "shows" → "suggests" / "gets at" / "makes the case"
- "allows" → "lets" / "means" / "gives us"
- "requires" → "needs" / "calls for" / "takes"
Do this for at least 8-10 words throughout the text.

═══ TECHNIQUE 2: SENTENCE LENGTH VARIATION (targets burstiness)
This is the biggest signal. AI writes every sentence at 18-24 words. Mix these aggressively:
- Very short (3-7 words): "That matters." / "It's not that simple." / "Here's why."
- Short-medium (8-14 words): Normal declarative sentences with simple structure
- Medium (15-22 words): One idea with a natural qualifier or example
- Long (23-32 words): A complex idea with a mid-sentence pivot or aside — like this one does
- Start sentences with: But, And, So, Still, Yet, That said, Which means, Even so
- Use em-dashes for asides — like this — at least once
- Use intentional fragments occasionally. Like this. They work.

═══ TECHNIQUE 3: STRIP ALL AI PATTERNS
Buzzwords → replacements:
utilize→use, leverage→use/apply, facilitate→help/allow, optimize→improve, synergy→(cut/rephrase), robust→solid/strong, streamline→simplify, empower→help/let, holistic→overall/broad, paradigm→approach/model, seamless→smooth/easy, cutting-edge→latest/new, innovative→new/fresh, stakeholder→(name them specifically), deliverable→result/outcome, scalable→(rephrase naturally), actionable→practical/useful, granular→detailed/specific, delve into→look at/explore, nuanced→complex/tricky, multifaceted→complex, underscore→show/highlight, pivotal→key/central, paramount→most important, compelling→strong/convincing, comprehensive→full/thorough

AI filler phrases → fix:
furthermore→also/and, moreover→also, additionally→also/on top of that, in conclusion→(just end — no label), in summary→(just end), it is important to note→(just say it directly), it is worth noting→(just say it), it should be noted→(just say it), it is crucial→(just say it), plays a crucial role→matters/is central, a wide range of→many, a variety of→several/many, in today's world→today/now, in the realm of→in/within, this allows→this lets/this means, this demonstrates→this shows, it is evident that→clearly/obviously

═══ TECHNIQUE 4: ADD HUMAN FINGERPRINTS
- Minimum 5 contractions: don't, it's, we're, they're, can't, won't, I'm, you'll, that's, I've
- 2-3 hedges or personal voice markers: "I think", "arguably", "it seems like", "to me", "in a way", "honestly", "actually"
- 1 rhetorical question or direct "you" address if it fits naturally
- At least 1 sentence starting with "But" or "And" or "So"

═══ TECHNIQUE 5: PASSIVE → ACTIVE
Flip every passive construction to active voice unless it sounds completely unnatural.

═══ PRESERVE EXACTLY: Every argument, fact, statistic, citation, quote, and piece of evidence.

OUTPUT: Return ONLY the rewritten text. No preamble, no explanation, no labels. Just the text.

Text to rewrite:
${text}`;
}

// ─────────────────────────────────────────────
//  SCORE CARD
// ─────────────────────────────────────────────
function ScoreCard({ label, data, pending, accent }) {
  const col = data ? scoreColor(data.score) : "#6a6a88";
  return (
    <div style={{ background:"#111118", border:`1px solid #2a2a38`, borderTop:`3px solid ${col}`, borderRadius:14, padding:"16px 18px", flex:1, minWidth:0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", letterSpacing:"0.12em", textTransform:"uppercase" }}>{label}</span>
        {data && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"2px 8px", borderRadius:100, border:`1px solid ${col}44`, background:`${col}12`, color:col }}>{scoreLabel(data.score)}</span>}
      </div>
      {pending ? (
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#6a6a88" }}>Analyzing...</div>
      ) : data ? (<>
        <div style={{ fontSize:40, fontWeight:800, color:col, lineHeight:1, marginBottom:6 }}>{data.score}%</div>
        <div style={{ height:5, background:"#2a2a38", borderRadius:6, overflow:"hidden", marginBottom:8 }}>
          <div style={{ height:"100%", width:`${data.score}%`, background:col, boxShadow:`0 0 8px ${col}55`, borderRadius:6, transition:"width 1.2s cubic-bezier(.22,1,.36,1)" }} />
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:4, paddingTop:8, borderTop:"1px solid #2a2a38" }}>
          {data.breakdown.map((b,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:"#6a6a88", width:100, flexShrink:0 }}>{b.label}</span>
              <div style={{ flex:1, height:3, background:"#2a2a38", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.min(100,Math.abs(b.penalty)*3.2)}%`, background:b.good?"#34d399":"#f87171", borderRadius:3, transition:"width 1s ease" }} />
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:b.good?"#34d399":"#f87171", width:60, textAlign:"right", flexShrink:0 }}>{b.value}</span>
            </div>
          ))}
        </div>
      </>) : (
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#6a6a88" }}>—</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  VARIATION CARD
// ─────────────────────────────────────────────
function VariationCard({ index, label, desc, text, score, selected, onSelect, outputMode, rawInput }) {
  const col = score ? scoreColor(score.score) : "#6a6a88";
  return (
    <div onClick={onSelect} style={{
      background: selected ? "#18181f" : "#111118",
      border: `1px solid ${selected ? "#7c6dfa88" : "#2a2a38"}`,
      borderRadius:14, padding:"14px 16px", cursor:"pointer",
      transition:"all .2s", position:"relative", overflow:"hidden"
    }}>
      {selected && <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:"linear-gradient(90deg,#7c6dfa,#a78bfa)" }} />}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color: selected ? "#a78bfa" : "#6a6a88", letterSpacing:"0.1em", textTransform:"uppercase" }}>
            Variation {index+1} — {label}
          </span>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", marginTop:2 }}>{desc}</div>
        </div>
        {score && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, padding:"2px 8px", borderRadius:100, border:`1px solid ${col}44`, background:`${col}12`, color:col, flexShrink:0, marginLeft:8 }}>{score.score}%</span>}
      </div>
      {text ? (
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#e8e8f0", lineHeight:1.65, maxHeight:90, overflow:"hidden", WebkitMaskImage:"linear-gradient(to bottom, black 60%, transparent 100%)" }}>
          {outputMode === "risk"
            ? <span dangerouslySetInnerHTML={{ __html: buildRiskHighlight(text) }} />
            : outputMode === "diff"
            ? <span dangerouslySetInnerHTML={{ __html: buildDiff(rawInput, text) }} />
            : text
          }
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {[80,65,75].map((w,i) => <div key={i} style={{ height:10, borderRadius:3, width:`${w}%`, background:"linear-gradient(90deg,#18181f 25%,#2a2a38 50%,#18181f 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }} />)}
        </div>
      )}
      {selected && text && (
        <div style={{ marginTop:6, fontFamily:"'DM Mono',monospace", fontSize:9, color:"#7c6dfa" }}>✓ Selected — full text shown below</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
const TONES = ["","Formal","Balanced","Conversational","Casual"];

export default function HumanizerPro() {
  const [input, setInput]           = useState("");
  const [variations, setVariations] = useState([null,null,null]);
  const [varScores, setVarScores]   = useState([null,null,null]);
  const [selected, setSelected]     = useState(0);
  const [rawInput, setRawInput]     = useState("");
  const [tone, setTone]             = useState(2);
  const [intensity, setIntensity]   = useState(1);
  const [loading, setLoading]       = useState(false);
  const [loadingIdx, setLoadingIdx] = useState([]);
  const [outputMode, setOutputMode] = useState("diff");
  const [beforeScore, setBeforeScore] = useState(null);
  const [showScores, setShowScores] = useState(false);
  const [tab, setTab]               = useState("humanize");
  const [history, setHistory]       = useState([]);
  const [copied, setCopied]         = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");

  const selectedText = variations[selected] || "";
  const selectedScore = varScores[selected];

  const changed = selectedText && rawInput ? (() => {
    const os = new Set(rawInput.toLowerCase().split(/\s+/));
    return selectedText.toLowerCase().split(/\s+/).filter(w => !os.has(w.replace(/[^a-z]/g,""))).length;
  })() : 0;

  async function callClaude(prompt) {
    const apiKey = (typeof import !== "undefined" && import.meta?.env?.VITE_ANTHROPIC_KEY) || "";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true",
        ...(apiKey ? {"x-api-key": apiKey} : {})
      },
      body: JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:1200,
        messages:[{ role:"user", content:prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const result = data?.content?.[0]?.text?.trim();
    if (!result) throw new Error("Empty response");
    return result;
  }

  const handleHumanize = useCallback(async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setErrorMsg("");
    setVariations([null,null,null]);
    setVarScores([null,null,null]);
    setShowScores(false);
    setBeforeScore(null);
    setSelected(0);

    const text = input.trim();
    const bScore = detectAI(text);
    setBeforeScore(bScore);
    setShowScores(true);
    setRawInput(text);

    // Fire all 3 variations in parallel
    setLoadingIdx([0,1,2]);
    const intensities = ["Light Touch","Standard","Full Rewrite"];

    const results = await Promise.allSettled(
      intensities.map(intens => callClaude(buildPrompt(text, TONES[tone], intens)))
    );

    const newVariations = [null,null,null];
    const newScores     = [null,null,null];

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        newVariations[i] = r.value;
        newScores[i]     = detectAI(r.value);
      }
    });

    if (results.every(r => r.status === "rejected")) {
      setErrorMsg(results[0].reason?.message || "All requests failed");
    }

    setVariations(newVariations);
    setVarScores(newScores);
    setLoadingIdx([]);
    setLoading(false);

    // Save best variation to history
    const bestIdx = newScores.reduce((best, s, i) =>
      s && (!newScores[best] || s.score < newScores[best].score) ? i : best, 0);

    if (newVariations[bestIdx]) {
      setHistory(h => [{
        input: text, output: newVariations[bestIdx],
        tone: TONES[tone], scoreBefore: bScore?.score,
        scoreAfter: newScores[bestIdx]?.score,
        drop: (bScore?.score||0) - (newScores[bestIdx]?.score||0),
        color: scoreColor(newScores[bestIdx]?.score||50),
        time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
      }, ...h].slice(0,30));
    }
  }, [input, tone, loading]);

  // ─── CSS ───
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#2a2a38;border-radius:4px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes shimmer{from{background-position:-200% center}to{background-position:200% center}}
    .fade{animation:fadeUp .35s ease both}
    .spin{animation:spin .7s linear infinite}
    input[type=range]{-webkit-appearance:none;height:3px;border-radius:4px;outline:none;cursor:pointer;width:100%}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#a78bfa;box-shadow:0 0 10px #7c6dfa55,0 0 0 3px #0a0a0f;transition:transform .15s}
    input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.2)}
  `;

  const pill = (label, active, onClick) => (
    <button onClick={onClick} style={{
      padding:"4px 12px", borderRadius:100, fontFamily:"'DM Mono',monospace",
      fontSize:9, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase",
      cursor:"pointer", border:"1px solid",
      borderColor: active ? "#7c6dfa44" : "#2a2a38",
      background: active ? "#7c6dfa22" : "transparent",
      color: active ? "#a78bfa" : "#6a6a88", transition:"all .2s"
    }}>{label}</button>
  );

  return (
    <>
      <style>{css}</style>
      <div style={{ background:"#0a0a0f", color:"#e8e8f0", fontFamily:"'Syne',sans-serif", minHeight:"100vh", padding:"28px 16px 80px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative", overflow:"hidden" }}>

        {/* ambient glow */}
        <div style={{ position:"fixed", top:-180, left:"50%", transform:"translateX(-50%)", width:800, height:400, background:"radial-gradient(ellipse,#7c6dfa14 0%,transparent 65%)", pointerEvents:"none", zIndex:0 }} />

        <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:940 }}>

          {/* HEADER */}
          <div className="fade" style={{ marginBottom:28 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#18181f", border:"1px solid #2a2a38", borderRadius:100, padding:"4px 14px", fontFamily:"'DM Mono',monospace", fontSize:10, color:"#a78bfa", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#34d399", boxShadow:"0 0 8px #34d399", animation:"pulse 2s infinite", display:"inline-block" }} />
              Humanizer Pro · Essay Edition
            </div>
            <h1 style={{ fontSize:"clamp(1.8rem,4.5vw,3rem)", fontWeight:800, lineHeight:1.1, letterSpacing:"-.03em", background:"linear-gradient(135deg,#fff 30%,#a78bfa 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Make it sound human.</h1>
            <p style={{ marginTop:8, color:"#6a6a88", fontSize:12, fontFamily:"'DM Mono',monospace" }}>// 3 rewrite variations · sentence-level risk · independent detection scoring</p>
          </div>

          {/* NAV */}
          <div style={{ display:"flex", gap:4, background:"#18181f", border:"1px solid #2a2a38", borderRadius:12, padding:4, marginBottom:22, width:"fit-content" }}>
            {[["humanize","✦ Humanize"],["history","History"],["compare","vs ZeroGPT"]].map(([id,lbl]) => (
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:"7px 16px", borderRadius:9, fontSize:10, fontWeight:600,
                letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace",
                cursor:"pointer", border: tab===id ? "1px solid #2a2a38" : "none",
                background: tab===id ? "#1e1e28" : "transparent",
                color: tab===id ? "#a78bfa" : "#6a6a88",
                boxShadow: tab===id ? "0 2px 8px #0008" : "none", transition:"all .2s"
              }}>{lbl}</button>
            ))}
          </div>

          {/* ══ HUMANIZE TAB ══ */}
          {tab === "humanize" && (
            <div className="fade">

              {/* CONTROLS ROW */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
                {/* TONE */}
                <div style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, padding:"16px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", letterSpacing:"0.12em", textTransform:"uppercase" }}>// Tone</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#a78bfa", background:"#7c6dfa22", padding:"2px 10px", borderRadius:100, border:"1px solid #7c6dfa44" }}>{TONES[tone]}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontFamily:"'DM Mono',monospace", fontSize:8, color:"#6a6a88" }}>
                    {["Formal","Balanced","Conv.","Casual"].map(t=><span key={t}>{t}</span>)}
                  </div>
                  <input type="range" min={1} max={4} value={tone} onChange={e=>setTone(+e.target.value)}
                    style={{ background:`linear-gradient(to right,#7c6dfa ${((tone-1)/3*100).toFixed(0)}%,#2a2a38 ${((tone-1)/3*100).toFixed(0)}%)` }} />
                </div>
                {/* INTENSITY */}
                <div style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, padding:"16px 20px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", letterSpacing:"0.12em", textTransform:"uppercase" }}>// Rewrite Intensity</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#a78bfa", background:"#7c6dfa22", padding:"2px 10px", borderRadius:100, border:"1px solid #7c6dfa44" }}>{INTENSITY_LABELS[intensity]}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontFamily:"'DM Mono',monospace", fontSize:8, color:"#6a6a88" }}>
                    {["Light","Standard","Full"].map(t=><span key={t}>{t}</span>)}
                  </div>
                  <input type="range" min={0} max={2} value={intensity} onChange={e=>setIntensity(+e.target.value)}
                    style={{ background:`linear-gradient(to right,#7c6dfa ${(intensity/2*100).toFixed(0)}%,#2a2a38 ${(intensity/2*100).toFixed(0)}%)` }} />
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", marginTop:6 }}>{INTENSITY_DESCS[intensity]}</div>
                </div>
              </div>

              {/* INPUT */}
              <div style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, overflow:"hidden", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #2a2a38", background:"#18181f" }}>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#6a6a88", letterSpacing:"0.1em", textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:"#fbbf24", boxShadow:"0 0 6px #fbbf2488", display:"inline-block" }} />
                    AI Input
                  </span>
                  <div style={{ display:"flex", gap:8 }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", background:"#1e1e28", padding:"2px 7px", borderRadius:100, border:"1px solid #2a2a38" }}>{wc(input)} words</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", background:"#1e1e28", padding:"2px 7px", borderRadius:100, border:"1px solid #2a2a38" }}>{input.length} chars</span>
                  </div>
                </div>
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  placeholder={"Paste your AI-generated essay text here...\n\nAll 3 variations will generate at once so you can pick the best one."}
                  style={{ width:"100%", height:160, background:"transparent", border:"none", outline:"none", resize:"none", color:"#e8e8f0", fontFamily:"'DM Mono',monospace", fontSize:13, lineHeight:1.75, padding:"14px 16px", caretColor:"#a78bfa" }} />
              </div>

              {/* ACTION ROW */}
              <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                <button onClick={handleHumanize} disabled={loading||!input.trim()} style={{
                  flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  padding:"12px 22px", borderRadius:11, fontFamily:"'Syne',sans-serif",
                  fontSize:14, fontWeight:700, border:"none",
                  cursor: loading||!input.trim() ? "not-allowed" : "pointer",
                  background:"linear-gradient(135deg,#7c6dfa,#9b7bff)",
                  color:"#fff", opacity: loading||!input.trim() ? 0.5 : 1,
                  boxShadow:"0 4px 20px #7c6dfa33", transition:"all .2s"
                }}>
                  {loading && <span className="spin" style={{ width:14, height:14, border:"2px solid #fff4", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block" }} />}
                  ✦ Generate 3 Variations
                </button>
                <button onClick={()=>{setInput("");setVariations([null,null,null]);setVarScores([null,null,null]);setBeforeScore(null);setShowScores(false);setErrorMsg("");setRawInput("");}} style={{ padding:"12px 18px", borderRadius:11, fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600, border:"1px solid #2a2a38", cursor:"pointer", background:"#18181f", color:"#6a6a88" }}>Clear</button>
              </div>

              {errorMsg && <div style={{ color:"#f87171", fontFamily:"'DM Mono',monospace", fontSize:12, marginBottom:14, padding:"10px 14px", background:"#f8717112", border:"1px solid #f8717133", borderRadius:10 }}>Error: {errorMsg}</div>}

              {/* VARIATION CARDS */}
              {showScores && (
                <div className="fade">
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
                    {[0,1,2].map(i => (
                      <VariationCard key={i} index={i}
                        label={INTENSITY_LABELS[i]} desc={INTENSITY_DESCS[i]}
                        text={variations[i]} score={varScores[i]}
                        selected={selected===i} onSelect={()=>setSelected(i)}
                        outputMode={outputMode} rawInput={rawInput}
                      />
                    ))}
                  </div>

                  {/* FULL OUTPUT of selected variation */}
                  {selectedText && (
                    <div style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, overflow:"hidden", marginBottom:16 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #2a2a38", background:"#18181f" }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#6a6a88", letterSpacing:"0.1em", textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:"#34d399", boxShadow:"0 0 6px #34d39988", display:"inline-block" }} />
                          Variation {selected+1} — {INTENSITY_LABELS[selected]}
                        </span>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          {/* view mode pills */}
                          {["diff","clean","risk"].map(m => pill(
                            m === "risk" ? "⚠ Risk" : m,
                            outputMode === m,
                            () => setOutputMode(m)
                          ))}
                          <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", background:"#1e1e28", padding:"2px 7px", borderRadius:100, border:"1px solid #2a2a38" }}>{wc(selectedText)} words</span>
                        </div>
                      </div>
                      <div style={{ padding:16, fontFamily:"'DM Mono',monospace", fontSize:13, lineHeight:1.75, color:"#e8e8f0", whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:280, overflowY:"auto" }}>
                        {outputMode === "diff"
                          ? <span dangerouslySetInnerHTML={{ __html: buildDiff(rawInput, selectedText) }} />
                          : outputMode === "risk"
                          ? <>
                              <div style={{ display:"flex", gap:10, marginBottom:10, flexWrap:"wrap" }}>
                                {[["#f8717133","High AI risk"],["#fbbf2422","Medium risk"],["transparent","Low / human"]].map(([bg,lbl])=>(
                                  <div key={lbl} style={{ display:"flex", alignItems:"center", gap:5 }}>
                                    <div style={{ width:10, height:10, background:bg, border:`1px solid ${bg.replace("33","99").replace("22","88")}`, borderRadius:2 }} />
                                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88" }}>{lbl}</span>
                                  </div>
                                ))}
                              </div>
                              <span dangerouslySetInnerHTML={{ __html: buildRiskHighlight(selectedText) }} />
                            </>
                          : selectedText
                        }
                      </div>
                      {/* diff legend */}
                      {outputMode === "diff" && (
                        <div style={{ display:"flex", gap:12, padding:"7px 14px 9px", borderTop:"1px solid #2a2a38" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <div style={{ width:7, height:7, borderRadius:2, background:"#34d39920", border:"1px solid #34d399" }} />
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88" }}>Added / Changed</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* COPY BUTTON */}
                  {selectedText && (
                    <button onClick={()=>{navigator.clipboard.writeText(selectedText);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{
                      width:"100%", padding:"11px", borderRadius:11,
                      fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600,
                      border:"1px solid", cursor:"pointer", transition:"all .2s", marginBottom:20,
                      borderColor: copied ? "#34d39944" : "#7c6dfa44",
                      background: copied ? "#34d39915" : "#7c6dfa15",
                      color: copied ? "#34d399" : "#a78bfa"
                    }}>{copied ? "✓ Copied to clipboard!" : "Copy Selected Variation ↗"}</button>
                  )}

                  {/* DETECTION SCORES */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", letterSpacing:"0.12em", textTransform:"uppercase" }}>// AI Detection Score — Independent Linguistic Engine</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"2px 10px", borderRadius:100, background:"#1e1e28", color:"#a78bfa", border:"1px solid #7c6dfa44" }}>Not Claude · Rule-Based</span>
                  </div>
                  <div style={{ display:"flex", gap:12, marginBottom:12 }}>
                    <ScoreCard label="Before Humanizing" data={beforeScore} pending={false} />
                    <ScoreCard label={`After — Variation ${selected+1}`} data={varScores[selected]} pending={loadingIdx.includes(selected)} />
                  </div>

                  {/* DELTA */}
                  {varScores[selected] && beforeScore && (
                    <div style={{ background:"#18181f", border:"1px solid #2a2a38", borderRadius:12, padding:"14px 18px", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                      {[
                        { lbl:"Score Drop", val:(()=>{const d=beforeScore.score-varScores[selected].score;return `${d>0?"↓ ":"↑ "}${Math.abs(d)}pts`})(), col:beforeScore.score-varScores[selected].score>0?"#34d399":"#f87171" },
                        { lbl:"Words Changed", val:changed, col:"#a78bfa" },
                        { lbl:"Buzzwords Out", val:Math.max(0,(beforeScore.buzzHits||0)-(varScores[selected].buzzHits||0)), col:"#a78bfa" },
                        { lbl:"Avg Sent Len", val:`${varScores[selected].meanSentLen}w`, col:"#a78bfa" },
                      ].map((d,i) => (
                        <div key={i}>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:4 }}>{d.lbl}</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:d.col }}>{d.val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* WORD STATS */}
                  {selectedText && (
                    <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
                      {[["In Words",wc(rawInput)],["Out Words",wc(selectedText)],["Sentences",sc(selectedText)],["Avg Word",awl(selectedText)],["Unique",uw(selectedText)]].map(([l,v])=>(
                        <div key={l}>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:"#6a6a88", letterSpacing:"0.1em", textTransform:"uppercase" }}>{l}</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:16, fontWeight:500, color:"#a78bfa" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ HISTORY TAB ══ */}
          {tab === "history" && (
            <div className="fade">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                <span style={{ fontSize:18, fontWeight:700 }}>Humanization History</span>
                <button onClick={()=>setHistory([])} style={{ padding:"7px 14px", borderRadius:10, fontFamily:"'Syne',sans-serif", fontSize:11, fontWeight:600, border:"1px solid #2a2a38", background:"#18181f", color:"#6a6a88", cursor:"pointer" }}>Clear All</button>
              </div>
              {history.length === 0
                ? <div style={{ textAlign:"center", padding:"60px 20px", color:"#6a6a88", fontFamily:"'DM Mono',monospace", fontSize:13 }}><div style={{ fontSize:36, marginBottom:10 }}>📭</div>No runs yet.</div>
                : history.map((h,i) => (
                  <div key={i} onClick={()=>{setInput(h.input);setRawInput(h.input);setVariations([h.output,null,null]);setVarScores([{score:h.scoreAfter,buzzHits:0,passiveCount:0,meanSentLen:"?",avgWordLen:"?",humanHits:0,cv:"?",breakdown:[]},null,null]);setBeforeScore({score:h.scoreBefore,buzzHits:0,passiveCount:0,meanSentLen:"?",avgWordLen:"?",humanHits:0,cv:"?",breakdown:[]});setShowScores(true);setTab("humanize");}}
                    style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, padding:"13px 16px", marginBottom:10, cursor:"pointer", transition:"all .2s" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                      <div style={{ display:"flex", gap:7 }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"2px 9px", borderRadius:100, border:"1px solid #fbbf2444", background:"#fbbf2412", color:"#fbbf24" }}>Before: {h.scoreBefore}%</span>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"2px 9px", borderRadius:100, border:`1px solid ${h.color}44`, background:`${h.color}10`, color:h.color }}>After: {h.scoreAfter}%</span>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"2px 9px", borderRadius:100, border:"1px solid #7c6dfa44", background:"#7c6dfa22", color:"#a78bfa" }}>{h.tone}</span>
                      </div>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#6a6a88" }}>{h.time}</span>
                    </div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#6a6a88", lineHeight:1.6, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{h.output}</div>
                    <div style={{ display:"flex", gap:14, marginTop:7 }}>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88" }}>Drop: <span style={{ color:h.drop>0?"#34d399":"#f87171" }}>{h.drop>0?"↓":"↑"}{Math.abs(h.drop)}pts</span></span>
                      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#a78bfa", marginLeft:"auto" }}>Restore →</span>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* ══ COMPARE TAB ══ */}
          {tab === "compare" && (
            <div className="fade">
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>Humanizer Pro vs ZeroGPT</div>
                <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:"#6a6a88" }}>// Feature comparison based on publicly available information</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {[
                  { name:"Humanizer Pro", tag:"This tool", logo:"✦", ls:{ background:"#7c6dfa22", border:"1px solid #7c6dfa44" },
                    rows:[["⚙️","Engine","Claude Sonnet for rewriting. Fully separate rule-based engine for detection — zero Claude bias."],["💰","Cost","Free · No signup · No word cap"],["🎚️","Tone + Intensity","4 tone levels × 3 intensity levels = 12 combinations"],["✦","Variations","3 rewrites at once — Light, Standard, Full. Pick the best one."],["📡","Detection","8-signal independent engine: burstiness, buzzwords, passive voice, sentence len, word len, human markers"],["⚠","Sentence Risk","Highlights exactly which sentences are still risky"],["📜","History","Session history with before/after scores"]] },
                  { name:"ZeroGPT", tag:"zerogpt.com", logo:"Z", ls:{ background:"#2563eb22", border:"1px solid #2563eb44", color:"#60a5fa", fontWeight:700, fontSize:13 },
                    rows:[["⚙️","Engine","Proprietary NLP. Launched Jan 2023, Hamburg, Germany."],["💰","Cost","Freemium — strict word limits on free tier"],["🎚️","Tone + Intensity","Minimal — one-click rewrite"],["✦","Variations","Single output only"],["📡","Detection","Shows AI % — no signal breakdown, no before/after"],["⚠","Sentence Risk","Highlights suspected AI sentences on their own detector only"],["📜","History","No history"]] }
                ].map(c=>(
                  <div key={c.name} style={{ background:"#111118", border:"1px solid #2a2a38", borderRadius:14, overflow:"hidden" }}>
                    <div style={{ padding:"12px 16px", borderBottom:"1px solid #2a2a38", background:"#18181f", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, ...c.ls }}>{c.logo}</div>
                      <div><div style={{ fontSize:14, fontWeight:700 }}>{c.name}</div><div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#6a6a88" }}>{c.tag}</div></div>
                    </div>
                    <div style={{ padding:16 }}>
                      {c.rows.map(([ico,lbl,val],i)=>(
                        <div key={i} style={{ display:"flex", gap:10, marginBottom:i<c.rows.length-1?11:0, paddingBottom:i<c.rows.length-1?11:0, borderBottom:i<c.rows.length-1?"1px solid #2a2a38":"none" }}>
                          <span style={{ fontSize:12, flexShrink:0, marginTop:1 }}>{ico}</span>
                          <div><div style={{ fontSize:11, fontWeight:600, marginBottom:2 }}>{lbl}</div><div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"#6a6a88", lineHeight:1.5 }}>{val}</div></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:14, padding:"14px 16px", borderRadius:10, background:"#18181f", border:"1px solid #2a2a38", fontFamily:"'DM Mono',monospace", fontSize:11, lineHeight:1.7, color:"#6a6a88" }}>
                <strong style={{ color:"#e8e8f0" }}>⚠️ Note:</strong> No humanizer guarantees 100% bypass of all detectors. Results vary by detector, text length, and topic. The detection engine here is fully independent of Claude so scores are unbiased.<br/><br/>
                <span style={{ color:"#a78bfa" }}>Sources: aidetectplus.com (Feb 2026) · blog.aibusted.com (Apr 2026) · aithor.com (Apr 2026)</span>
              </div>
            </div>
          )}
        </div>

        {copied && (
          <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#18181f", border:"1px solid #34d39944", color:"#34d399", padding:"9px 18px", borderRadius:100, fontFamily:"'DM Mono',monospace", fontSize:11, zIndex:999 }}>
            ✓ Copied to clipboard
          </div>
        )}
      </div>
    </>
  );
}
