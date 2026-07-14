import { Captions, CheckCircle2, Link2, Repeat2, Scissors, ShieldCheck } from "lucide-react";
import { useState } from "react";

export function ShowcaseApp() {
  const params = new URLSearchParams(location.search);
  const initialStep = (params.get("step") as "player" | "segment" | "loop") || "loop";
  const [looping, setLooping] = useState(initialStep === "loop");
  const [step, setStep] = useState<"player" | "segment" | "loop">(initialStep);
  return <main className={`cd-showcase ${params.get("theme") === "light" ? "is-light" : ""}`}>
    <header><div><small>ContentDeck · Example data</small><h1>Practice one short, rights-safe segment</h1><p>A generated local test clip with original synthetic audio stays local. Provider detection, subtitles, and looping are shown without a network request.</p></div><span><ShieldCheck size={16}/>Privacy-safe showcase</span></header>
    <nav aria-label="Showcase steps"><button className={step === "player" ? "active" : ""} onClick={() => setStep("player")}><Link2/>1. Load</button><button className={step === "segment" ? "active" : ""} onClick={() => setStep("segment")}><Scissors/>2. Segment</button><button className={step === "loop" ? "active" : ""} onClick={() => setStep("loop")}><Repeat2/>3. Repeat</button></nav>
    <section className="cd-showcase-grid">
      <div className="cd-player">
        <video autoPlay muted loop={looping} playsInline src="/showcase/contentdeck-demo.mp4" aria-label="Generated abstract motion test clip" />
        <div className="cd-caption"><Captions size={18}/><span>Observe the transition, then repeat the selected phrase.</span></div>
        {step !== "player" && <div className="cd-timeline"><i></i><span style={{left:"34%"}}>00:12</span><span style={{left:"72%"}}>00:28</span></div>}
      </div>
      <aside>
        <section><small>Provider</small><strong>Local rights-safe media</strong><p><CheckCircle2/>Detected without network access</p></section>
        <section><small>Subtitle track</small><strong>English · 4 cues</strong><p><CheckCircle2/>Visible during playback</p></section>
        <section><small>Selected segment</small>{step === "player" ? <strong>Not selected yet</strong> : <><div className="cd-times"><b>00:12</b><span>to</span><b>00:28</b></div><p>16 seconds</p></>}</section>
        <button className={looping ? "is-on" : ""} onClick={() => setLooping(value => !value)}><Repeat2/>{looping ? "Repeat enabled" : "Enable repeat"}</button>
      </aside>
    </section>
  </main>;
}
