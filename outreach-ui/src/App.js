import { useState, useEffect, useRef } from "react";

const SERVER = process.env.NODE_ENV === "production" ? "" : "http://localhost:3001";
const TABS = ["Telegram", "Dex Scraper", "TG Admins", "History", "Logs", "Account"];

const DEFAULT_TG_TEMPLATES = [
  `Hey man! Luci here from Moonshot Win, a cross-chain crash game. We'd love to add your token to our game to give it more utility and visibility. Let me know if I can share more details.`,
  `Hey! Luci from Moonshot Win here. We run a cross-chain crash game and would like to integrate your token to bring it more exposure and real use in our platform. Happy to share details if you're interested.`,
  `Hi! This is Luci from Moonshot Win. We're building a cross-chain crash game and would love to feature your token inside the game for added utility and reach. Let me know if you'd like to hear more.`,
];

// ── Design tokens ──────────────────────────────────────────────────────────────
const GN = "#00ff9d"; // neon green
const BL = "#00cfff"; // neon blue
const GL = "#f5c542"; // gold
const PU = "#b97bff"; // purple
const RD = "#ff4f4f"; // red

const glow = (c, px = 12) => `0 0 ${px}px ${c}33, 0 0 ${px * 2}px ${c}18`;

const $ = {
  page: {
    minHeight: "100vh",
    background: "#050810",
    color: "#f0f6ff",
    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
    fontSize: 14,
  },
  card: {
    background: "linear-gradient(145deg, #0a0f1e, #080d18)",
    border: "1px solid #1a2540",
    borderRadius: 14,
    padding: "22px 26px",
  },
  glowCard: (c = GN) => ({
    background: "linear-gradient(145deg, #0a0f1e, #080d18)",
    border: `1px solid ${c}30`,
    borderRadius: 14,
    padding: "22px 26px",
    boxShadow: glow(c, 10),
  }),
  input: {
    background: "#060b18",
    border: "1px solid #1e2d47",
    borderRadius: 9,
    color: "#ffffff",
    padding: "11px 15px",
    fontFamily: "inherit",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  label: {
    fontSize: 10,
    color: GL,
    letterSpacing: "0.15em",
    display: "block",
    marginBottom: 8,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  btn: (c = GN) => ({
    background: `${c}18`,
    border: `1px solid ${c}55`,
    color: c,
    borderRadius: 9,
    padding: "11px 22px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.05em",
    boxShadow: glow(c, 6),
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  }),
  btnSm: (c = GN) => ({
    background: `${c}12`,
    border: `1px solid ${c}40`,
    color: c,
    borderRadius: 7,
    padding: "5px 13px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.05em",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  }),
  tag: (c) => ({
    background: `${c}18`,
    color: c,
    border: `1px solid ${c}40`,
    borderRadius: 5,
    padding: "2px 9px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    display: "inline-block",
    whiteSpace: "nowrap",
  }),
};

// ── Tiny components ─────────────────────────────────────────────────────────
function Tag({ color, children }) {
  return <span style={$.tag(color)}>{children}</span>;
}

function Pill({ color = GN, on, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...$.tag(color) }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: glow(color, 4), display: "inline-block", animation: on ? "blink 1.4s ease-in-out infinite" : "none" }} />
      {children}
    </span>
  );
}

function SocialLink({ href, label, color }) {
  if (!href) return <span style={{ color: "#ddeeff", fontSize: 12 }}>—</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
      style={{ color, fontSize: 11, fontWeight: 700, textDecoration: "none", background: color + "18", border: `1px solid ${color}40`, borderRadius: 5, padding: "3px 9px" }}>
      {label} ↗
    </a>
  );
}

function LogPane({ lines, endRef, placeholder = "Waiting...", minH = 100, maxH = 280 }) {
  return (
    <div style={{ background: "#030609", border: "1px solid #0f1f35", borderRadius: 9, padding: "10px 14px", minHeight: minH, maxHeight: maxH, overflowY: "auto", fontSize: 12, lineHeight: 1.9, fontFamily: "monospace" }}>
      {lines.length === 0
        ? <span style={{ color: "#ddeeff" }}>{placeholder}</span>
        : lines.map((l, i) => {
            const t = typeof l === "string" ? l : l.text;
            const type = typeof l === "object" ? l.type : "";
            const c = type === "error" ? RD : type === "done" ? GL : type === "found" ? GN : type === "skip" ? "#6a8aaa" : "#c0d8ef";
            return <div key={i} style={{ color: c }}>{t}</div>;
          })}
      {endRef && <div ref={endRef} />}
    </div>
  );
}

function StatCard({ val, label, color }) {
  return (
    <div style={{ ...$.glowCard(color), display: "flex", flexDirection: "column", gap: 6, minWidth: 110, flex: 1 }}>
      <span style={{ color, fontWeight: 800, fontSize: 28, lineHeight: 1, textShadow: glow(color, 8) }}>{val}</span>
      <span style={{ color: "#ddeeff", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function ResultsTable({ results = [], doneProjects = new Set() }) {
  if (!results.length) return <div style={{ color: "#ddeeff", textAlign: "center", padding: 40 }}>No results</div>;
  const visible = results.filter(r => !doneProjects.has((r.tgLink || r.name || "").toLowerCase()));
  const hidden = results.length - visible.length;
  return (
    <div style={{ overflowX: "auto" }}>
      {hidden > 0 && <div style={{ padding: "6px 16px", color: "#ddeeff", fontSize: 11 }}>{hidden} hidden (marked done)</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1a2540" }}>
            {["#", "Project", "Telegram", "X / Twitter", "Discord"].map(h => (
              <th key={h} style={{ color: GL, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 16px", textAlign: "left", fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #0a1020" }}>
              <td style={{ color: "#ddeeff", padding: "10px 16px", fontSize: 11 }}>{String(i + 1).padStart(2, "0")}</td>
              <td style={{ padding: "10px 16px", maxWidth: 200 }}>
                <div style={{ color: "#ffffff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                {r.chainId && <div style={{ color: "#ddeeff", fontSize: 10, marginTop: 2 }}>{r.chainId}</div>}
              </td>
              <td style={{ padding: "10px 16px" }}><SocialLink href={r.tgLink} label="TG" color={GN} /></td>
              <td style={{ padding: "10px 16px" }}><SocialLink href={r.xLink} label="X" color={BL} /></td>
              <td style={{ padding: "10px 16px" }}><SocialLink href={r.discordLink} label="DSC" color={PU} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemplateEditor({ templates, setTemplates, editing, setEditing }) {
  return (
    <div>
      <label style={$.label}>Message Templates — rotates per recipient</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {templates.map((t, i) => (
          <div key={i} style={{ ...$.card, border: `1px solid ${editing === i ? GN + "55" : "#1a2540"}`, transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing === i ? 12 : 0 }}>
              <span style={{ color: "#ddeeff", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700 }}>TEMPLATE {i + 1}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditing(editing === i ? null : i)} style={$.btnSm(GL)}>{editing === i ? "DONE" : "EDIT"}</button>
                {templates.length > 1 && <button onClick={() => { setEditing(null); setTemplates(p => p.filter((_, idx) => idx !== i)); }} style={$.btnSm(RD)}>DEL</button>}
              </div>
            </div>
            {editing === i
              ? <textarea value={t} onChange={e => setTemplates(p => p.map((tp, idx) => idx === i ? e.target.value : tp))} rows={4} style={{ ...$.input, resize: "vertical" }} />
              : <div style={{ color: "#ffffff", fontSize: 13, lineHeight: 1.8, marginTop: 8 }}>{t}</div>
            }
          </div>
        ))}
        <button onClick={() => setTemplates(p => [...p, "Hey! Luci from Moonshot Win — let me know if you'd like to hear more."])}
          style={{ ...$.btn(GN), background: "none", border: `1px dashed ${GN}25`, boxShadow: "none", textAlign: "center" }}>
          + ADD TEMPLATE
        </button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Telegram");

  // Campaign
  const [tgUsernames, setTgUsernames] = useState("");
  const [tgTemplates, setTgTemplates] = useState(DEFAULT_TG_TEMPLATES);
  const [editingTpl, setEditingTpl] = useState(null);
  const [tgDelay, setTgDelay] = useState(60);
  const [tgDelayMax, setTgDelayMax] = useState(90);
  const [botRunning, setBotRunning] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [liveLines, setLiveLines] = useState([]);

  // Dex
  const [dexUrl, setDexUrl] = useState("");
  const [dexScraping, setDexScraping] = useState(false);
  const [dexLogs, setDexLogs] = useState([]);
  const [dexHistory, setDexHistory] = useState([]);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [viewAllScrapes, setViewAllScrapes] = useState(false);

  // TG Admins
  const [tgAdminScraping, setTgAdminScraping] = useState(false);
  const [tgAdminLogs, setTgAdminLogs] = useState([]);
  const [tgAdminResults, setTgAdminResults] = useState([]);
  const [tgAdminFilter, setTgAdminFilter] = useState("all");
  const [tgAdminCopied, setTgAdminCopied] = useState(false);
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [fetchingJoined, setFetchingJoined] = useState(false);
  const [joinedFetchLogs, setJoinedFetchLogs] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [contacted, setContacted] = useState(new Set());
  const [blacklistedGroups, setBlacklistedGroups] = useState(new Set());
  const [doneProjects, setDoneProjects] = useState(new Set());

  // Auth
  const [tgAuth, setTgAuth] = useState({ loggedIn: false, phone: null, apiId: null });
  const [tgLoginStep, setTgLoginStep] = useState("idle");
  const [tgApiId, setTgApiId] = useState("");
  const [tgApiHash, setTgApiHash] = useState("");
  const [tgPhone, setTgPhone] = useState("");
  const [tgOtp, setTgOtp] = useState("");
  const [tg2fa, setTg2fa] = useState("");
  const [tgLoginError, setTgLoginError] = useState("");
  const [tgLoginLoading, setTgLoginLoading] = useState(false);

  const sseRef = useRef(null);
  const dexSseRef = useRef(null);
  const tgAdminSseRef = useRef(null);
  const tgJoinedSseRef = useRef(null);
  const liveEndRef = useRef(null);
  const dexLogsEndRef = useRef(null);
  const tgAdminLogsEndRef = useRef(null);
  const logsEndRef = useRef(null);

  const stats = {
    sent: logs.filter(l => l.status === "sent").length,
    failed: logs.filter(l => l.status === "failed").length,
    positive: logs.filter(l => l.status === "positive").length,
  };

  // ── Bootstrap ──
  useEffect(() => {
    const check = async () => {
      try { const d = await fetch(`${SERVER}/api/status`).then(r => r.json()); setServerOnline(true); setBotRunning(d.running); }
      catch { setServerOnline(false); }
    };
    check(); const iv = setInterval(check, 3000); return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetch(`${SERVER}/api/logs`).then(r => r.json()).then(setLogs).catch(() => {});
    fetch(`${SERVER}/api/dex/history`).then(r => r.json()).then(setDexHistory).catch(() => {});
    fetch(`${SERVER}/api/contacted`).then(r => r.json()).then(d => {
      setContacted(new Set((d.contacted || []).map(u => u.startsWith("@") ? u.toLowerCase() : "@" + u.toLowerCase())));
    }).catch(() => {});
    fetch(`${SERVER}/api/blacklisted-groups`).then(r => r.json()).then(d => setBlacklistedGroups(new Set(d.groups || []))).catch(() => {});
    fetch(`${SERVER}/api/done-projects`).then(r => r.json()).then(d => setDoneProjects(new Set((d.projects || []).map(p => p.toLowerCase())))).catch(() => {});
    fetch(`${SERVER}/api/auth/tg/status`).then(r => r.json()).then(d => setTgAuth(d)).catch(() => {});
  }, []);

  useEffect(() => { liveEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [liveLines]);
  useEffect(() => { dexLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [dexLogs]);
  useEffect(() => { tgAdminLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [tgAdminLogs]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ── Handlers ──
  async function handleRunTG() {
    if (!serverOnline) { alert("Server offline!"); return; }
    const config = {
      telegram: { usernames: tgUsernames.split("\n").map(s => s.trim()).filter(Boolean), groups: [], delaySeconds: tgDelay, delaySecondsMax: tgDelayMax },
      tgTemplates, generatedAt: new Date().toISOString(),
    };
    await fetch(`${SERVER}/api/campaign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    const res = await fetch(`${SERVER}/api/run`, { method: "POST" });
    const data = await res.json();
    if (!data.ok) { alert(data.error); return; }
    setBotRunning(true); setLiveLines([]); setTab("Logs");
    if (sseRef.current) sseRef.current.close();
    const sse = new EventSource(`${SERVER}/api/logs/stream`);
    sseRef.current = sse;
    sse.onmessage = e => {
      const d = JSON.parse(e.data);
      setLiveLines(p => [...p, d.text]);
      if (d.type === "done") { setBotRunning(false); sse.close(); fetch(`${SERVER}/api/logs`).then(r => r.json()).then(setLogs); }
    };
  }

  async function handleStop() {
    await fetch(`${SERVER}/api/stop`, { method: "POST" });
    setBotRunning(false);
    if (sseRef.current) sseRef.current.close();
  }

  async function handleDexScrape() {
    if (!dexUrl.trim()) { alert("Paste a DexScreener URL first"); return; }
    if (!serverOnline) { alert("Server offline!"); return; }
    setDexScraping(true); setDexLogs([]);
    if (dexSseRef.current) dexSseRef.current.close();
    const sse = new EventSource(`${SERVER}/api/dex/stream`);
    dexSseRef.current = sse;
    sse.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.stage !== "scrape") return;
      if (d.text) setDexLogs(p => [...p, { type: d.type, text: d.text }]);
      if (d.type === "results") {
        if (d.historyEntry) setDexHistory(p => [d.historyEntry, ...p.filter(h => h.id !== d.historyEntry.id)]);
        setDexScraping(false); sse.close(); setTab("History");
      }
      if (d.type === "error") { setDexScraping(false); sse.close(); }
    };
    sse.onerror = () => {
      setTimeout(async () => {
        try { const h = await fetch(`${SERVER}/api/dex/history`).then(r => r.json()); if (h?.length) { setDexHistory(h); setTab("History"); } } catch {}
        setDexScraping(false); sse.close();
      }, 1500);
    };
    await new Promise(r => setTimeout(r, 400));
    await fetch(`${SERVER}/api/dex/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: dexUrl }) });
  }

  async function handleFetchJoinedGroups() {
    if (!serverOnline) { alert("Server offline!"); return; }
    setFetchingJoined(true); setJoinedFetchLogs([]); setJoinedGroups([]); setSelectedGroups(new Set());
    if (tgJoinedSseRef.current) tgJoinedSseRef.current.close();
    const sse = new EventSource(`${SERVER}/api/tg/joined-stream`);
    tgJoinedSseRef.current = sse;
    sse.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.stage !== "joinedgroups") return;
      if (d.text) setJoinedFetchLogs(p => [...p, { type: d.type, text: d.text }]);
      if (d.type === "results") {
        const all = d.groups || [];
        setJoinedGroups(all);
        setSelectedGroups(new Set(all.filter(g => !contacted.has(g.link?.toLowerCase()) && !blacklistedGroups.has(g.link?.toLowerCase())).map(g => g.link)));
        setFetchingJoined(false); sse.close();
      }
      if (d.type === "error") { setFetchingJoined(false); sse.close(); }
    };
    sse.onerror = () => { setFetchingJoined(false); sse.close(); };
    await new Promise(r => setTimeout(r, 400));
    await fetch(`${SERVER}/api/tg/fetch-joined-groups`, { method: "POST" });
  }

  async function handleTgAdminScrape() {
    const groups = [...selectedGroups];
    if (!groups.length) { alert("No groups selected. Fetch your joined groups first."); return; }
    if (!serverOnline) { alert("Server offline!"); return; }
    setTgAdminScraping(true); setTgAdminLogs([]); setTgAdminResults([]);
    if (tgAdminSseRef.current) tgAdminSseRef.current.close();
    const sse = new EventSource(`${SERVER}/api/tg/stream`);
    tgAdminSseRef.current = sse;
    sse.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.stage !== "tgscrape") return;
      if (d.text) setTgAdminLogs(p => [...p, { type: d.type, text: d.text }]);
      if (d.type === "results") { setTgAdminResults(d.results || []); setTgAdminScraping(false); sse.close(); }
      if (d.type === "error") { setTgAdminScraping(false); sse.close(); }
    };
    sse.onerror = () => {
      setTimeout(async () => {
        try { const h = await fetch(`${SERVER}/api/tg/admin-history`).then(r => r.json()); if (h?.length) setTgAdminResults(h[0]?.results || []); } catch {}
        setTgAdminScraping(false); sse.close();
      }, 1500);
    };
    await new Promise(r => setTimeout(r, 400));
    await fetch(`${SERVER}/api/tg/scrape-admins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groups }) });
  }

  function getAdmins(results, filter = "all") {
    return (results || []).flatMap(g => (g.members || [])
      .filter(m => filter === "all" || m.role.toLowerCase().includes(filter.toLowerCase()))
      .map(m => ({ ...m, groupName: g.groupName, groupLink: g.groupLink })));
  }

  function copyUsernames(results, filter) {
    const text = getAdmins(results, filter).filter(m => m.username.startsWith("@") && !contacted.has(m.username.toLowerCase())).map(m => m.username).join("\n");
    navigator.clipboard.writeText(text).then(() => { setTgAdminCopied(true); setTimeout(() => setTgAdminCopied(false), 2000); });
  }

  async function blacklistGroup(link) {
    await fetch(`${SERVER}/api/blacklist-group`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
    setBlacklistedGroups(p => new Set([...p, link.toLowerCase()]));
    setJoinedGroups(p => p.filter(g => g.link?.toLowerCase() !== link.toLowerCase()));
    setSelectedGroups(p => { const n = new Set(p); n.delete(link); return n; });
  }

  async function handleTgSendCode() {
    setTgLoginError(""); setTgLoginLoading(true);
    try {
      const d = await fetch(`${SERVER}/api/auth/tg/send-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiId: tgApiId, apiHash: tgApiHash, phone: tgPhone }) }).then(r => r.json());
      if (!d.ok) throw new Error(d.error);
      setTgLoginStep("otp");
    } catch (e) { setTgLoginError(e.message); }
    setTgLoginLoading(false);
  }

  async function handleTgVerifyCode() {
    setTgLoginError(""); setTgLoginLoading(true);
    try {
      const d = await fetch(`${SERVER}/api/auth/tg/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: tgOtp, password: tg2fa || undefined }) }).then(r => r.json());
      if (d.need2FA) { setTgLoginStep("2fa"); setTgLoginLoading(false); return; }
      if (!d.ok) throw new Error(d.error);
      setTgLoginStep("done");
      setTgAuth(await fetch(`${SERVER}/api/auth/tg/status`).then(r => r.json()));
    } catch (e) { setTgLoginError(e.message); }
    setTgLoginLoading(false);
  }

  async function handleTgLogout() {
    await fetch(`${SERVER}/api/auth/tg/logout`, { method: "POST" });
    setTgAuth({ loggedIn: false, phone: null, apiId: null });
    setTgLoginStep("idle"); setTgApiId(""); setTgApiHash(""); setTgPhone(""); setTgOtp(""); setTg2fa("");
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={$.page}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        * { box-sizing:border-box; }
        ::placeholder { color:#2a3855 !important; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#050810; }
        ::-webkit-scrollbar-thumb { background:#1a2540; border-radius:4px; }
        input:focus, textarea:focus { border-color: #00ff9d55 !important; box-shadow: 0 0 0 2px #00ff9d0a !important; }
        button:hover { filter:brightness(1.25); transform:translateY(-1px); }
        button:active { transform:translateY(0); }
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.8; }
      `}</style>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
      <header style={{ borderBottom: "1px solid #0f1a30", padding: "0 32px", background: "rgba(5,8,16,0.97)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px)", display: "flex", alignItems: "stretch" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, paddingRight: 32, borderRight: "1px solid #0f1a30" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${GN}, ${BL})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, boxShadow: glow(GN, 10) }}>⚡</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "0.12em" }}>OUTREACH BOT</div>
            <div style={{ fontSize: 9, color: "#ddeeff", letterSpacing: "0.2em" }}>MOONSHOT WIN</div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: "flex", flex: 1, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", borderBottom: tab === t ? `2px solid ${GN}` : "2px solid transparent",
              color: tab === t ? GN : "#7a9fc0", padding: "0 20px", height: 58, cursor: "pointer", fontSize: 11,
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.1em", whiteSpace: "nowrap",
              textShadow: tab === t ? `0 0 12px ${GN}88` : "none", transition: "all 0.2s",
            }}>{t.toUpperCase()}</button>
          ))}
        </nav>

        {/* Status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 24 }}>
          <Pill color={serverOnline ? GN : RD} on={!serverOnline}>{serverOnline ? "ONLINE" : "OFFLINE"}</Pill>
          {botRunning && <Pill color={GL} on>RUNNING</Pill>}
          {stats.sent > 0 && (
            <span style={{ color: "#ddeeff", fontSize: 11 }}>
              <span style={{ color: GN, fontWeight: 700 }}>{stats.sent}</span> sent
              {stats.failed > 0 && <> · <span style={{ color: RD, fontWeight: 700 }}>{stats.failed}</span> failed</>}
            </span>
          )}
        </div>
      </header>

      {/* ═══ MAIN ══════════════════════════════════════════════════════════ */}
      <main style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto" }}>

        {/* Offline banner */}
        {!serverOnline && (
          <div style={{ background: `${RD}10`, border: `1px solid ${RD}30`, borderRadius: 10, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, color: "#ffffff", fontSize: 13 }}>
            <span style={{ color: RD, fontWeight: 700 }}>⚠ Server offline —</span>
            run <code style={{ background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: 5, padding: "2px 8px", fontSize: 12 }}>node server.js</code>
          </div>
        )}

        {/* ─────────────────────────────────────────── TELEGRAM ─── */}
        {tab === "Telegram" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>
            {/* Left: config */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>Telegram Outreach</h2>
                <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Direct message campaign via your TG account</p>
              </div>

              <div style={$.card}>
                <label style={$.label}>Usernames to DM — one per line</label>
                <textarea value={tgUsernames} onChange={e => setTgUsernames(e.target.value)} rows={9}
                  style={{ ...$.input, resize: "vertical" }} placeholder={"@username1\n@username2\n@username3"} />
                <div style={{ color: "#ddeeff", fontSize: 11, marginTop: 8, letterSpacing: "0.05em" }}>
                  {tgUsernames.split("\n").filter(Boolean).length} targets queued
                </div>
              </div>

              <div style={$.card}>
                <label style={$.label}>Delay between messages</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "MIN", val: tgDelay, set: v => setTgDelay(v), min: 15, max: 180, color: GN },
                    { label: "MAX", val: tgDelayMax, set: v => setTgDelayMax(v), min: tgDelay, max: 300, color: GL },
                  ].map(({ label, val, set, min, max, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ color: "#ddeeff", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, width: 30 }}>{label}</span>
                      <input type="range" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color, cursor: "pointer" }} />
                      <span style={{ color, fontWeight: 800, fontSize: 18, minWidth: 48, textAlign: "right", textShadow: glow(color, 6) }}>{val}s</span>
                    </div>
                  ))}
                  <div style={{ color: "#ddeeff", fontSize: 11 }}>Random {tgDelay}–{tgDelayMax}s between each message</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {!botRunning
                  ? <button onClick={handleRunTG} disabled={!serverOnline || !tgUsernames.trim()}
                      style={{ ...$.btn(GN), flex: 1, opacity: (serverOnline && tgUsernames.trim()) ? 1 : 0.3, cursor: (serverOnline && tgUsernames.trim()) ? "pointer" : "not-allowed" }}>
                      ▶ RUN CAMPAIGN
                    </button>
                  : <button onClick={handleStop} style={{ ...$.btn(RD), flex: 1 }}>⏹ STOP BOT</button>
                }
              </div>
            </div>

            {/* Right: templates */}
            <div style={$.card}>
              <TemplateEditor templates={tgTemplates} setTemplates={setTgTemplates} editing={editingTpl} setEditing={setEditingTpl} />
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────── DEX SCRAPER ─── */}
        {tab === "Dex Scraper" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>DexScreener Scraper</h2>
              <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Extract Telegram, X, and Discord links from token listings</p>
            </div>

            <div style={{ display: "flex", gap: 10, maxWidth: 780, marginBottom: 20 }}>
              <input value={dexUrl} onChange={e => setDexUrl(e.target.value)} style={$.input}
                placeholder="https://dexscreener.com/solana?rankBy=trendingScoreH6&order=desc&minLiq=1000" />
              <button onClick={handleDexScrape} disabled={dexScraping || !serverOnline}
                style={{ ...$.btn(GN), opacity: (dexScraping || !serverOnline) ? 0.3 : 1 }}>
                {dexScraping ? "SCRAPING..." : "🔍 SCRAPE"}
              </button>
            </div>

            {dexLogs.length > 0 && (
              <div style={{ maxWidth: 780, marginBottom: 20 }}>
                <LogPane lines={dexLogs} endRef={dexLogsEndRef} placeholder="Starting scrape..." />
              </div>
            )}

            {!dexScraping && dexLogs.length === 0 && (
              <div style={{ ...$.card, textAlign: "center", padding: 60, maxWidth: 500 }}>
                <div style={{ fontSize: 42, marginBottom: 14, filter: `drop-shadow(0 0 16px ${GN})` }}>🔍</div>
                <div style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Ready to scrape</div>
                <div style={{ color: "#ddeeff", fontSize: 13, marginBottom: 20 }}>Paste any DexScreener listing URL above</div>
                <button onClick={() => setTab("History")} style={$.btnSm(BL)}>VIEW HISTORY →</button>
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────── TG ADMINS ─── */}
        {tab === "TG Admins" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>TG Admin Scraper</h2>
              <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Fetch your joined groups → scrape all admins, owners & mods</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
              {/* Step 1 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ color: GN, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>STEP 1 — LOAD YOUR GROUPS</div>
                <button onClick={handleFetchJoinedGroups} disabled={fetchingJoined || !serverOnline}
                  style={{ ...$.btn(BL), opacity: (fetchingJoined || !serverOnline) ? 0.3 : 1 }}>
                  {fetchingJoined ? "FETCHING..." : "📡 FETCH JOINED GROUPS"}
                </button>
                <LogPane lines={joinedFetchLogs} placeholder="Click above to load groups..." minH={80} maxH={110} />

                {joinedGroups.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#ddeeff", fontSize: 11, fontWeight: 700 }}>{selectedGroups.size}/{joinedGroups.length} selected</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setSelectedGroups(new Set(joinedGroups.filter(g => !blacklistedGroups.has(g.link?.toLowerCase())).map(g => g.link)))} style={$.btnSm(GN)}>ALL</button>
                        <button onClick={() => setSelectedGroups(new Set())} style={$.btnSm("#3a5575")}>NONE</button>
                      </div>
                    </div>
                    <div style={{ background: "#030609", border: "1px solid #0f1f35", borderRadius: 9, maxHeight: 300, overflowY: "auto" }}>
                      {joinedGroups.map((g, i) => {
                        const checked = selectedGroups.has(g.link);
                        const dmed = contacted.has(g.link?.toLowerCase());
                        const bl = blacklistedGroups.has(g.link?.toLowerCase());
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", borderBottom: "1px solid #0a1020", opacity: bl ? 0.2 : 1 }}>
                            <div onClick={() => { if (bl) return; setSelectedGroups(p => { const n = new Set(p); checked ? n.delete(g.link) : n.add(g.link); return n; }); }}
                              style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${checked ? GN : "#1a2540"}`, background: checked ? GN : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: bl ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
                              {checked && <span style={{ color: "#050810", fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, cursor: bl ? "not-allowed" : "pointer" }}
                              onClick={() => { if (bl) return; setSelectedGroups(p => { const n = new Set(p); checked ? n.delete(g.link) : n.add(g.link); return n; }); }}>
                              <div style={{ color: "#ffffff", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                              <div style={{ color: "#ddeeff", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.link}</div>
                            </div>
                            {dmed && <Tag color={GL}>DMed</Tag>}
                            {g.participantsCount && <span style={{ color: "#ddeeff", fontSize: 10, flexShrink: 0 }}>{g.participantsCount.toLocaleString()}</span>}
                            {!bl && <button onClick={() => blacklistGroup(g.link)} style={{ ...$.btnSm(RD), padding: "3px 8px", flexShrink: 0 }}>✕</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ color: GN, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>STEP 2 — SCRAPE ADMINS</div>
                <button onClick={handleTgAdminScrape} disabled={tgAdminScraping || !serverOnline || selectedGroups.size === 0}
                  style={{ ...$.btn(GN), opacity: (tgAdminScraping || selectedGroups.size === 0) ? 0.3 : 1 }}>
                  {tgAdminScraping ? "SCRAPING..." : `🔍 SCRAPE ${selectedGroups.size} GROUP${selectedGroups.size !== 1 ? "S" : ""}`}
                </button>
                <LogPane lines={tgAdminLogs} endRef={tgAdminLogsEndRef} placeholder="Logs appear here..." minH={200} maxH={420} />
              </div>
            </div>

            {/* Admin results */}
            {tgAdminResults.length > 0 && (() => {
              const all = getAdmins(tgAdminResults, "all");
              return (
                <div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                    <StatCard val={tgAdminResults.length} label="Groups" color={GN} />
                    <StatCard val={all.length} label="Total Admins" color={BL} />
                    <StatCard val={getAdmins(tgAdminResults, "Owner").length} label="Owners" color={GL} />
                    <StatCard val={all.filter(m => m.username.startsWith("@")).length} label="With @handle" color={PU} />
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => copyUsernames(tgAdminResults, tgAdminFilter)} style={$.btnSm(BL)}>
                        {tgAdminCopied ? "✓ COPIED!" : "COPY @HANDLES"}
                      </button>
                      <button onClick={() => {
                        const rows = getAdmins(tgAdminResults, tgAdminFilter);
                        const csv = "Username,Name,Role,Group\n" + rows.map(m => `${m.username},"${m.displayName}","${m.role}","${m.groupName}"`).join("\n");
                        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `admins_${Date.now()}.csv`; a.click();
                      }} style={$.btnSm(GL)}>EXPORT CSV</button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
                    {["all", "Owner", "Admin", "Moderator"].map(f => (
                      <button key={f} onClick={() => setTgAdminFilter(f)}
                        style={{ ...$.btnSm(tgAdminFilter === f ? GN : "#3a5575"), border: `1px solid ${tgAdminFilter === f ? GN + "55" : "#1a2540"}` }}>
                        {f === "all" ? "All" : f + "s"} ({getAdmins(tgAdminResults, f).length})
                      </button>
                    ))}
                  </div>

                  {tgAdminResults.map((group, gi) => {
                    const filtered = group.members.filter(m => {
                      const u = (m.username?.startsWith("@") ? m.username : "@" + m.username).toLowerCase();
                      return !contacted.has(u) && (tgAdminFilter === "all" || m.role.toLowerCase().includes(tgAdminFilter.toLowerCase()));
                    });
                    if (!filtered.length) return null;
                    return (
                      <div key={gi} style={{ ...$.card, overflow: "hidden", marginBottom: 14 }}>
                        <div style={{ padding: "10px 18px", borderBottom: "1px solid #0f1a30", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#040710", margin: "-22px -26px 18px" }}>
                          <div>
                            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 14 }}>{group.groupName}</span>
                            <a href={group.groupLink} target="_blank" rel="noreferrer" style={{ color: BL, fontSize: 11, marginLeft: 10 }}>{group.groupLink} ↗</a>
                          </div>
                          <Tag color={GN}>{filtered.length} members</Tag>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #0f1a30" }}>
                              {["Username", "Display Name", "Role"].map(h => (
                                <th key={h} style={{ color: GL, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 16px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((m, mi) => (
                              <tr key={mi} style={{ borderBottom: "1px solid #070b18" }}>
                                <td style={{ padding: "9px 16px" }}>
                                  {m.username.startsWith("@")
                                    ? <a href={`https://t.me/${m.username.slice(1)}`} target="_blank" rel="noreferrer" style={{ color: GN, fontWeight: 700, textDecoration: "none", textShadow: glow(GN, 6) }}>{m.username} ↗</a>
                                    : <span style={{ color: "#ddeeff", fontStyle: "italic" }}>{m.username}</span>}
                                </td>
                                <td style={{ color: "#ffffff", padding: "9px 16px" }}>{m.displayName}</td>
                                <td style={{ padding: "9px 16px" }}>
                                  <Tag color={m.role.startsWith("Owner") ? GL : m.role.startsWith("Mod") ? PU : BL}>{m.role}</Tag>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ─────────────────────────────────────────────── HISTORY ─── */}
        {tab === "History" && (
          <div>
            {viewAllScrapes ? (() => {
              const seen = new Set(); const unique = [];
              for (const e of dexHistory) for (const r of (e.results || [])) {
                const k = (r.tgLink || r.name || "").toLowerCase().trim();
                if (k && !seen.has(k)) { seen.add(k); unique.push(r); }
              }
              const pending = unique.filter(r => !doneProjects.has((r.tgLink || r.name || "").toLowerCase()));
              const done = unique.length - pending.length;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                    <button onClick={() => setViewAllScrapes(false)} style={$.btnSm(BL)}>← BACK</button>
                    <div>
                      <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700 }}>All Unique Projects</h2>
                      <p style={{ margin: "3px 0 0", color: "#ddeeff", fontSize: 12 }}>{unique.length} total · {pending.length} pending · {done} done</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                    <StatCard val={unique.length} label="Unique" color={GN} />
                    <StatCard val={pending.length} label="Pending" color={GL} />
                    <StatCard val={done} label="Done" color="#3a5575" />
                  </div>
                  <div style={$.card}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1a2540" }}>
                          {["#", "Project", "Telegram", "X", "Discord", ""].map(h => (
                            <th key={h} style={{ color: GL, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 16px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unique.map((r, i) => {
                          const key = (r.tgLink || r.name || "").toLowerCase();
                          const isDone = doneProjects.has(key);
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #070b18", opacity: isDone ? 0.3 : 1 }}>
                              <td style={{ color: "#ddeeff", padding: "9px 16px", fontSize: 11 }}>{String(i + 1).padStart(2, "0")}</td>
                              <td style={{ padding: "9px 16px", maxWidth: 200 }}>
                                <div style={{ color: isDone ? "#6a8aaa" : "#e8f0ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none" }}>{r.name}</div>
                                {r.chainId && <div style={{ color: "#ddeeff", fontSize: 10 }}>{r.chainId}</div>}
                              </td>
                              <td style={{ padding: "9px 16px" }}><SocialLink href={r.tgLink} label="TG" color={GN} /></td>
                              <td style={{ padding: "9px 16px" }}><SocialLink href={r.xLink} label="X" color={BL} /></td>
                              <td style={{ padding: "9px 16px" }}><SocialLink href={r.discordLink} label="DSC" color={PU} /></td>
                              <td style={{ padding: "9px 16px" }}>
                                {isDone
                                  ? <button onClick={async () => { await fetch(`${SERVER}/api/done-project`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => {}); setDoneProjects(p => { const n = new Set(p); n.delete(key); return n; }); }} style={$.btnSm("#3a5575")}>UNDO</button>
                                  : <button onClick={async () => { await fetch(`${SERVER}/api/done-project`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => {}); setDoneProjects(p => new Set([...p, key])); }} style={$.btnSm(GN)}>✓ DONE</button>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })() : viewingEntry ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
                  <button onClick={() => setViewingEntry(null)} style={$.btnSm(BL)}>← BACK</button>
                  <div>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700 }}>Scrape — {viewingEntry.count} tokens</h2>
                    <p style={{ margin: "3px 0 0", color: "#ddeeff", fontSize: 12 }}>{new Date(viewingEntry.scrapedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div style={$.card}><ResultsTable results={viewingEntry.results} doneProjects={doneProjects} /></div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>Scrape History</h2>
                    <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>All previous DexScreener scrapes</p>
                  </div>
                  <div style={{ display: "flex", gap: 9 }}>
                    {dexHistory.length > 0 && <button onClick={() => setViewAllScrapes(true)} style={$.btnSm(GN)}>VIEW ALL UNIQUE →</button>}
                    <button onClick={async () => {
                      if (!window.confirm("Clear ALL history and logs?")) return;
                      await fetch(`${SERVER}/api/history/clear`, { method: "DELETE" });
                      setDexHistory([]); setLogs([]); setLiveLines([]);
                    }} style={$.btnSm(RD)}>🗑 CLEAR ALL</button>
                  </div>
                </div>

                {dexHistory.length > 0 && (() => {
                  const all = dexHistory.flatMap(e => e.results || []);
                  const u = new Set(); all.forEach(r => { const k = (r.tgLink || r.name || "").toLowerCase(); if (k) u.add(k); });
                  return (
                    <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                      <StatCard val={u.size} label="Unique" color={GN} />
                      <StatCard val={all.filter(r => r.xLink).length} label="With X" color={BL} />
                      <StatCard val={all.filter(r => r.discordLink).length} label="With Discord" color={PU} />
                      <StatCard val={doneProjects.size} label="Done" color="#3a5575" />
                      <StatCard val={dexHistory.length} label="Scrapes" color={GL} />
                    </div>
                  );
                })()}

                {dexHistory.length === 0 ? (
                  <div style={{ ...$.card, textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 40, marginBottom: 14, filter: `drop-shadow(0 0 16px ${BL})` }}>📋</div>
                    <div style={{ color: "#ffffff", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No history yet</div>
                    <div style={{ color: "#ddeeff", fontSize: 13 }}>Run a scrape from the Dex Scraper tab</div>
                  </div>
                ) : (
                  <div style={$.card}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1a2540" }}>
                          {["Date & Time", "URL", "Tokens", "X Links", "Discord", "", ""].map(h => (
                            <th key={h} style={{ color: GL, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 16px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dexHistory.map((entry, i) => (
                          <tr key={entry.id || i} style={{ borderBottom: "1px solid #070b18" }}>
                            <td style={{ color: "#ffffff", padding: "11px 16px", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(entry.scrapedAt).toLocaleString()}</td>
                            <td style={{ color: "#ddeeff", padding: "11px 16px", fontSize: 11, maxWidth: 180 }}>
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.url || "—"}</div>
                            </td>
                            <td style={{ padding: "11px 16px" }}><span style={{ color: GN, fontWeight: 700, textShadow: glow(GN, 6) }}>{entry.count}</span></td>
                            <td style={{ padding: "11px 16px" }}><span style={{ color: BL, fontWeight: 600 }}>{entry.results?.filter(r => r.xLink).length || 0}</span></td>
                            <td style={{ padding: "11px 16px" }}><span style={{ color: PU, fontWeight: 600 }}>{entry.results?.filter(r => r.discordLink).length || 0}</span></td>
                            <td style={{ padding: "11px 16px" }}><button onClick={() => setViewingEntry(entry)} style={$.btnSm(BL)}>VIEW →</button></td>
                            <td style={{ padding: "11px 16px" }}>
                              <button onClick={() => {
                                setDexHistory(p => p.filter((_, idx) => idx !== i));
                                fetch(`${SERVER}/api/dex/history/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: entry.id }) }).catch(() => {});
                              }} style={$.btnSm(RD)}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────── LOGS ─── */}
        {tab === "Logs" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 12 }}>
                  Logs {botRunning && <Pill color={GL} on>RUNNING</Pill>}
                </h2>
                <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>
                  {logs.length} total · <span style={{ color: GN }}>{stats.sent} sent</span> · <span style={{ color: RD }}>{stats.failed} failed</span> · <span style={{ color: BL }}>{stats.positive} positive</span>
                </p>
              </div>
              <button onClick={() => { setLogs([]); setLiveLines([]); }} style={$.btnSm("#3a5575")}>CLEAR</button>
            </div>

            {liveLines.length > 0 && (
              <div style={{ background: "#030609", border: `1px solid ${GL}20`, borderRadius: 10, padding: "14px 18px", marginBottom: 20, maxHeight: 240, overflowY: "auto", fontSize: 12, lineHeight: 1.9, fontFamily: "monospace" }}>
                <div style={{ color: GL, fontSize: 9, letterSpacing: "0.2em", marginBottom: 10, fontWeight: 700 }}>TERMINAL OUTPUT</div>
                {liveLines.map((line, i) => <div key={i} style={{ color: "#ddeeff" }}>{line}</div>)}
                <div ref={liveEndRef} />
              </div>
            )}

            <div style={{ ...$.card, padding: 0, overflow: "hidden", maxHeight: 600 }}>
              {logs.length === 0 ? (
                <div style={{ color: "#ddeeff", textAlign: "center", padding: 60, fontSize: 13 }}>No logs yet — run a campaign from the Telegram tab</div>
              ) : (
                <div style={{ overflowY: "auto", maxHeight: 600 }}>
                  {logs.map((log, i) => {
                    const sc = log.status === "sent" ? GN : log.status === "failed" ? RD : log.status === "positive" ? BL : "#3a5575";
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 18px", borderBottom: "1px solid #070b18", background: log.status === "positive" ? `${BL}08` : "transparent" }}>
                        <span style={{ color: "#3a5070", fontSize: 11, whiteSpace: "nowrap", paddingTop: 2, flexShrink: 0 }}>{log.time}</span>
                        <Tag color={GN}>{log.platform}</Tag>
                        <span style={{ color: "#ffffff", fontSize: 13, whiteSpace: "nowrap", fontWeight: 600, flexShrink: 0 }}>{log.target}</span>
                        <Tag color={sc}>{log.status}</Tag>
                        <span style={{ color: "#ddeeff", fontSize: 12, flex: 1, lineHeight: 1.6, minWidth: 0 }}>{log.message}</span>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────── ACCOUNT ─── */}
        {tab === "Account" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>Account</h2>
              <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Connect your Telegram account to power the bot</p>
            </div>

            <div style={{ ...$.card, border: `1px solid ${tgAuth.loggedIn ? GN + "30" : "#1a2540"}`, boxShadow: tgAuth.loggedIn ? glow(GN, 12) : "none" }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${GN}15`, border: `1px solid ${GN}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, boxShadow: tgAuth.loggedIn ? glow(GN, 8) : "none" }}>✈️</div>
                  <div>
                    <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>Telegram</div>
                    <div style={{ color: "#ddeeff", fontSize: 11, marginTop: 2 }}>DMs & Admin scraping</div>
                  </div>
                </div>
                <Pill color={tgAuth.loggedIn ? GN : RD} on={!tgAuth.loggedIn}>{tgAuth.loggedIn ? "CONNECTED" : "DISCONNECTED"}</Pill>
              </div>

              {/* Connected state */}
              {tgAuth.loggedIn ? (
                <div>
                  <div style={{ background: "#030609", border: "1px solid #0f1f35", borderRadius: 9, padding: "16px 18px", marginBottom: 18, display: "flex", gap: 28, flexWrap: "wrap" }}>
                    {[["Phone", tgAuth.phone || "—", GN], ["API ID", tgAuth.apiId || "—", "#c0d8ef"], ["Session", "Active ✓", GN]].map(([label, val, color]) => (
                      <div key={label}>
                        <div style={{ color: "#ddeeff", fontSize: 9, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>
                        <div style={{ color, fontWeight: 700, fontSize: 15, textShadow: color === GN ? glow(GN, 6) : "none" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleTgLogout} style={$.btnSm(RD)}>LOGOUT</button>
                </div>
              ) : (
                <div>
                  {/* Step: idle */}
                  {tgLoginStep === "idle" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <p style={{ margin: 0, color: "#ddeeff", fontSize: 13, lineHeight: 1.7 }}>
                        Get your API credentials from <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer" style={{ color: BL }}>my.telegram.org/apps</a>
                      </p>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ width: 150 }}>
                          <label style={$.label}>API ID</label>
                          <input value={tgApiId} onChange={e => setTgApiId(e.target.value)} style={$.input} placeholder="12345678" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={$.label}>API HASH</label>
                          <input value={tgApiHash} onChange={e => setTgApiHash(e.target.value)} style={$.input} placeholder="abcdef1234567890..." />
                        </div>
                      </div>
                      <div>
                        <label style={$.label}>Phone (with country code)</label>
                        <input value={tgPhone} onChange={e => setTgPhone(e.target.value)} style={{ ...$.input, maxWidth: 220 }} placeholder="+1234567890" />
                      </div>
                      {tgLoginError && <div style={{ color: RD, fontSize: 12, background: `${RD}10`, border: `1px solid ${RD}25`, borderRadius: 7, padding: "9px 13px" }}>⚠ {tgLoginError}</div>}
                      <button onClick={handleTgSendCode} disabled={tgLoginLoading || !tgApiId || !tgApiHash || !tgPhone}
                        style={{ ...$.btn(GN), alignSelf: "flex-start", opacity: (!tgApiId || !tgApiHash || !tgPhone) ? 0.3 : 1 }}>
                        {tgLoginLoading ? "SENDING..." : "SEND OTP"}
                      </button>
                    </div>
                  )}

                  {/* Step: otp / 2fa */}
                  {(tgLoginStep === "otp" || tgLoginStep === "2fa") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ background: `${GN}10`, border: `1px solid ${GN}25`, borderRadius: 8, padding: "10px 14px", color: GN, fontSize: 13, textShadow: glow(GN, 4) }}>
                        OTP sent to {tgPhone} — check Telegram
                      </div>
                      <div>
                        <label style={$.label}>OTP Code</label>
                        <input value={tgOtp} onChange={e => setTgOtp(e.target.value)} style={{ ...$.input, maxWidth: 170, letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }} placeholder="·····" maxLength={6} />
                      </div>
                      {tgLoginStep === "2fa" && (
                        <div>
                          <div style={{ background: `${GL}10`, border: `1px solid ${GL}25`, borderRadius: 7, padding: "9px 13px", marginBottom: 10, color: GL, fontSize: 12 }}>
                            2FA required — enter your cloud password
                          </div>
                          <label style={$.label}>2FA Password</label>
                          <input type="password" value={tg2fa} onChange={e => setTg2fa(e.target.value)} style={{ ...$.input, maxWidth: 280 }} placeholder="Cloud password" />
                        </div>
                      )}
                      {tgLoginError && <div style={{ color: RD, fontSize: 12, background: `${RD}10`, border: `1px solid ${RD}25`, borderRadius: 7, padding: "9px 13px" }}>⚠ {tgLoginError}</div>}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={handleTgVerifyCode} disabled={tgLoginLoading || !tgOtp}
                          style={{ ...$.btn(GN), opacity: !tgOtp ? 0.3 : 1 }}>
                          {tgLoginLoading ? "VERIFYING..." : "VERIFY & LOGIN"}
                        </button>
                        <button onClick={() => { setTgLoginStep("idle"); setTgLoginError(""); setTgOtp(""); }} style={$.btnSm("#3a5575")}>← BACK</button>
                      </div>
                    </div>
                  )}

                  {tgLoginStep === "done" && (
                    <div style={{ color: GN, fontWeight: 700, fontSize: 15, textShadow: glow(GN, 8) }}>✓ Logged in successfully!</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}