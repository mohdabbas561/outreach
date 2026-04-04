import { useState, useEffect, useRef } from "react";

const SERVER = process.env.NODE_ENV === "production" ? "" : "http://localhost:3001";
const TABS = ["Telegram", "Dex Scraper", "TG Admins", "History", "Logs", "Account"];

const DEFAULT_TG_TEMPLATES = [
  `Hey [NAME]
We are a gaming provider and we build games tailored for Meme Tokens and GambleFi users. We see a strong fit with [TOKEN NAME], and we believe your holders would love seeing your token actively used inside our games.

We would love to explore a partnership and discuss how we can integrate your token into our games. If this interests you, let's connect and walk you through the full offering.

Looking forward to hearing from you!`,
  `Hey [NAME]
We are a gaming provider building game experiences for Meme Tokens and GambleFi users. [TOKEN NAME] feels like a strong fit, and your holders would likely enjoy seeing real token utility inside our games.

We would love to explore a partnership and discuss how we can integrate your token into our games. If this sounds interesting, let's connect and walk you through the full offering.

Looking forward to hearing from you!`,
  `Hey [NAME]
We are a gaming provider focused on Meme Token and GambleFi audiences. We see a clear match with [TOKEN NAME], and we believe your community would value seeing the token used directly in our games.

We would love to explore a partnership and discuss how we can integrate your token into our games. If you're open to it, let's connect and walk you through the full offering.

Looking forward to hearing from you!`,
];

// ── Design tokens ──────────────────────────────────────────────────────────────
const GN = "#00ff9d"; // neon green
const BL = "#00cfff"; // neon blue
const GL = "#f5c542"; // gold
const PU = "#b97bff"; // purple
const RD = "#ff4f4f"; // red

const glow = (c, px = 12) => `0 0 ${px}px ${c}33, 0 0 ${px * 2}px ${c}18`;
const getUtcToday = () => new Date().toISOString().slice(0, 10);

const $ = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 8% 0%, #11326450 0%, transparent 38%), radial-gradient(circle at 92% 12%, #0d5b4a40 0%, transparent 34%), #050810",
    color: "#f0f6ff",
    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
    fontSize: 14,
  },
  card: {
    background: "linear-gradient(145deg, #0b1120, #090f1a)",
    border: "1px solid #1a2540",
    borderRadius: 16,
    padding: "22px 26px",
    boxShadow: "0 14px 30px #00000066, inset 0 1px 0 #ffffff08",
  },
  glowCard: (c = GN) => ({
    background: "linear-gradient(145deg, #0b1120, #090f1a)",
    border: `1px solid ${c}30`,
    borderRadius: 16,
    padding: "22px 26px",
    boxShadow: `${glow(c, 10)}, 0 14px 30px #0000005c`,
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

function ResultsTable({ results = [], doneProjects = new Set(), joinedLinks = new Set() }) {
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
          {visible.map((r, i) => {
            const joined = Boolean(r.tgLink && joinedLinks.has(String(r.tgLink).toLowerCase()));
            return (
            <tr key={i} style={{ borderBottom: "1px solid #0a1020", opacity: joined ? 0.45 : 1 }}>
              <td style={{ color: "#ddeeff", padding: "10px 16px", fontSize: 11 }}>{String(i + 1).padStart(2, "0")}</td>
              <td style={{ padding: "10px 16px", maxWidth: 200 }}>
                <div style={{ color: "#ffffff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                {r.chainId && <div style={{ color: "#ddeeff", fontSize: 10, marginTop: 2 }}>{r.chainId}</div>}
              </td>
              <td style={{ padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                <SocialLink href={r.tgLink} label="TG" color={GN} />
                {joined && <Tag color="#3a5575">Joined</Tag>}
              </td>
              <td style={{ padding: "10px 16px" }}><SocialLink href={r.xLink} label="X" color={BL} /></td>
              <td style={{ padding: "10px 16px" }}><SocialLink href={r.discordLink} label="DSC" color={PU} /></td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  );
}

function TemplateEditor({ templates, setTemplates }) {
  const safeTemplates = (Array.isArray(templates) ? templates : [])
    .map((t) => String(t || ""))
    .filter((t) => t.trim().length > 0);
  const list = safeTemplates.length ? safeTemplates : [...DEFAULT_TG_TEMPLATES];

  const updateAt = (index, value) => {
    const next = [...list];
    next[index] = value;
    setTemplates(next);
  };

  const removeAt = (index) => {
    if (list.length <= 1) return;
    const next = list.filter((_, i) => i !== index);
    setTemplates(next.length ? next : [DEFAULT_TG_TEMPLATES[0]]);
  };

  const addTemplate = () => {
    const seed = list[0] || DEFAULT_TG_TEMPLATES[0];
    setTemplates([...list, seed]);
  };

  const resetDefaults = () => setTemplates([...DEFAULT_TG_TEMPLATES]);

  return (
    <div>
      <label style={$.label}>Message Templates - shuffled per recipient</label>
      <div style={{ color: "#ddeeff", fontSize: 11, marginBottom: 10 }}>
        Placeholders supported: [NAME], [TOKEN NAME]
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={addTemplate} style={$.btnSm(GN)}>+ ADD TEMPLATE</button>
        <button onClick={resetDefaults} style={$.btnSm("#3a5575")}>RESET DEFAULT 3</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {list.map((template, index) => (
          <div key={index} style={{ ...$.card, padding: "14px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Tag color={BL}>Template {index + 1}</Tag>
              <button
                onClick={() => removeAt(index)}
                disabled={list.length <= 1}
                style={{ ...$.btnSm(RD), opacity: list.length <= 1 ? 0.35 : 1, cursor: list.length <= 1 ? "not-allowed" : "pointer" }}
              >
                DEL
              </button>
            </div>
            <textarea
              value={template}
              onChange={e => updateAt(index, e.target.value)}
              rows={8}
              style={{ ...$.input, resize: "vertical", lineHeight: 1.7 }}
            />
          </div>
        ))}
      </div>
      <div style={{ color: "#6a8aaa", fontSize: 10, marginTop: 8 }}>
        Templates are auto-shuffled so recipients do not get the exact same message order.
      </div>
    </div>
  );
}

// Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("Telegram");
  const [isCompact, setIsCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 980;
  });

  // Campaign
  const [tgUsernames, setTgUsernames] = useState("");
  const [tgTemplates, setTgTemplates] = useState(DEFAULT_TG_TEMPLATES);
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
  const [clearingDexSeen, setClearingDexSeen] = useState(false);

  // TG Admins
  const [tgAdminScraping, setTgAdminScraping] = useState(false);
  const [tgAdminLogs, setTgAdminLogs] = useState([]);
  const [tgAdminResults, setTgAdminResults] = useState([]);
  const [tgAdminFilter, setTgAdminFilter] = useState("all");
  const [tgAdminCopied, setTgAdminCopied] = useState(false);
  const [tgGroupCopied, setTgGroupCopied] = useState("");
  const [joinedGroups, setJoinedGroups] = useState([]);
  const [fetchingJoined, setFetchingJoined] = useState(false);
  const [joinedFetchLogs, setJoinedFetchLogs] = useState([]);
  const [joinedDateFromUtc, setJoinedDateFromUtc] = useState(() => getUtcToday());
  const [joinedDateToUtc, setJoinedDateToUtc] = useState(() => getUtcToday());
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [contacted, setContacted] = useState(new Set());
  const [blacklistedGroups, setBlacklistedGroups] = useState(new Set());
  const [blockedAdmins, setBlockedAdmins] = useState(new Set());
  const [doneProjects, setDoneProjects] = useState(new Set());
  const [joinedTgLinks, setJoinedTgLinks] = useState(new Set());
  const [joinedLinksLoading, setJoinedLinksLoading] = useState(false);

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

  const getGroupKey = (group) => {
    if (group?.ref?.kind && group?.ref?.value) {
      return `${group.ref.kind}:${String(group.ref.value).toLowerCase()}`;
    }
    if (group?.link) return `link:${group.link.toLowerCase()}`;
    if (group?.id) return `id:${String(group.id).toLowerCase()}`;
    return `name:${String(group?.name || "").toLowerCase()}`;
  };

  const isGroupBlacklisted = (group) => {
    if (!group?.link) return false;
    return blacklistedGroups.has(group.link.toLowerCase());
  };

  const isGroupContacted = (group) => {
    if (!group?.link) return false;
    return contacted.has(group.link.toLowerCase());
  };

  const selectedCount = joinedGroups.filter(g => selectedGroups.has(getGroupKey(g))).length;
  const getTgGroupCopyKey = (group) => (group?.groupLink || group?.groupName || "").toLowerCase();
  const utcToday = getUtcToday();

  const utcDateOffset = (days) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const extractTokenFromGroupName = (groupName) => {
    const cleaned = String(groupName || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[^A-Za-z0-9$ ]+/g, " ")
      .trim();
    if (!cleaned) return "$TOKEN";
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const tokenCandidate = parts.find((p) => p.startsWith("$")) || parts[0];
    if (!tokenCandidate) return "$TOKEN";
    const token = tokenCandidate.replace(/[^A-Za-z0-9$]/g, "");
    if (!token) return "$TOKEN";
    return token.startsWith("$") ? token.toUpperCase() : `$${token.toUpperCase()}`;
  };

  const blockAdmin = async (username) => {
    const key = String(username).toLowerCase().trim();
    setBlockedAdmins(prev => new Set([...prev, key]));
    try {
      await fetch(`${SERVER}/api/block-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: key }),
      });
    } catch { /* ignore — already updated locally */ }
  };

  const unblockAdmin = async (username) => {
    const key = String(username).toLowerCase().trim();
    setBlockedAdmins(prev => { const n = new Set(prev); n.delete(key); return n; });
    try {
      await fetch(`${SERVER}/api/block-admin`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: key }),
      });
    } catch { /* ignore */ }
  };

  const queueTargetsFromAdminResults = () => {
    const lines = [];
    const seen = new Set();
    for (const group of tgAdminResults) {
      const tokenName = extractTokenFromGroupName(group.groupName);
      for (const member of group.members || []) {
        if (tgAdminFilter !== "all" && !String(member.role || "").toLowerCase().includes(tgAdminFilter.toLowerCase())) continue;
        const username = String(member.username || "");
        if (!username.startsWith("@")) continue;
        const normalized = username.toLowerCase();
        if (contacted.has(normalized) || seen.has(normalized) || blockedAdmins.has(normalized)) continue;
        seen.add(normalized);
        const name = String(member.displayName || "there").replace(/[|]/g, " ").trim() || "there";
        lines.push(`${username} | ${name} | ${tokenName}`);
      }
    }
    if (!lines.length) {
      alert("No new admins/mods available to queue.");
      return;
    }
    setTgUsernames(lines.join("\n"));
    setTab("Telegram");
  };

  function applyJoinedDatePreset(preset) {
    if (preset === "all") {
      setJoinedDateFromUtc("");
      setJoinedDateToUtc("");
      return;
    }
    if (preset === "today") {
      setJoinedDateFromUtc(utcToday);
      setJoinedDateToUtc(utcToday);
      return;
    }
    if (preset === "yesterday") {
      const day = utcDateOffset(-1);
      setJoinedDateFromUtc(day);
      setJoinedDateToUtc(day);
      return;
    }
    if (preset === "last7") {
      setJoinedDateFromUtc(utcDateOffset(-6));
      setJoinedDateToUtc(utcToday);
    }
  }

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth <= 980);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    fetch(`${SERVER}/api/blocked-admins`).then(r => r.json()).then(d => setBlockedAdmins(new Set(d.admins || []))).catch(() => {});
    fetch(`${SERVER}/api/done-projects`).then(r => r.json()).then(d => setDoneProjects(new Set((d.projects || []).map(p => p.toLowerCase())))).catch(() => {});
    fetch(`${SERVER}/api/auth/tg/status`).then(r => r.json()).then(d => setTgAuth(d)).catch(() => {});
  }, []);

  async function refreshJoinedTgLinks() {
    if (!tgAuth.loggedIn) return;
    setJoinedLinksLoading(true);
    try {
      const d = await fetch(`${SERVER}/api/tg/joined-links`).then(r => r.json());
      if (d?.ok) {
        setJoinedTgLinks(new Set((d.links || []).map((l) => String(l).toLowerCase())));
      }
    } catch {
      // ignore
    }
    setJoinedLinksLoading(false);
  }

  useEffect(() => {
    if (tab === "History" && tgAuth.loggedIn) {
      refreshJoinedTgLinks();
    }
  }, [tab, tgAuth.loggedIn]);

  useEffect(() => { liveEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [liveLines]);
  useEffect(() => { dexLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [dexLogs]);
  useEffect(() => { tgAdminLogsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [tgAdminLogs]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // ── Handlers ──
  async function handleRunTG() {
    if (!serverOnline) { alert("Server offline!"); return; }
    const parsedTargets = tgUsernames
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        const username = parts[0] || "";
        if (!username) return null;
        const safeUsername = username.startsWith("@") ? username : `@${username}`;
        let name = "there";
        let tokenName = "$TOKEN";
        if (parts[1]) {
          if (parts[1].startsWith("$")) tokenName = parts[1].toUpperCase();
          else name = parts[1];
        }
        if (parts[2]) {
          if (parts[2].startsWith("$")) tokenName = parts[2].toUpperCase();
          else if (name === "there") name = parts[2];
        }
        return { username: safeUsername, name: name || "there", tokenName: tokenName || "$TOKEN" };
      })
      .filter(Boolean);

    if (!parsedTargets.length) {
      alert("Add at least one Telegram target.");
      return;
    }

    const preparedTemplates = (Array.isArray(tgTemplates) ? tgTemplates : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    if (!preparedTemplates.length) {
      alert("Add at least one message template.");
      return;
    }

    const safeMinDelay = Math.max(90, tgDelay);
    const safeMaxDelay = Math.max(safeMinDelay, Math.max(180, tgDelayMax));
    const config = {
      telegram: {
        usernames: parsedTargets.map((t) => t.username),
        targets: parsedTargets,
        groups: [],
        delaySeconds: tgDelay,
        delaySecondsMax: tgDelayMax,
      },
      safety: {
        stopOnPeerFlood: true,
        skipPreviouslyMessaged: true,
        maxDmPerRun: 15,
        maxFailuresPerRun: 4,
        minDelaySeconds: safeMinDelay,
        maxDelaySeconds: safeMaxDelay,
        breakEvery: 4,
        breakMinSeconds: 180,
        breakMaxSeconds: 420,
      },
      tgTemplates: preparedTemplates,
      templateShuffle: true,
      generatedAt: new Date().toISOString(),
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

  async function handleClearDexSeenMemory() {
    if (!serverOnline) { alert("Server offline!"); return; }
    if (!window.confirm("Clear Dex unique memory? This allows previously scraped tokens to appear again.")) return;
    setClearingDexSeen(true);
    try {
      const d = await fetch(`${SERVER}/api/dex/seen/clear`, { method: "DELETE" }).then(r => r.json());
      if (!d.ok) throw new Error(d.error || "Failed to clear memory");
      setDexLogs(p => [...p, { type: "done", text: "Unique Dex memory cleared. Previously seen tokens can now appear again." }]);
    } catch (err) {
      setDexLogs(p => [...p, { type: "error", text: `Clear failed: ${err.message}` }]);
    }
    setClearingDexSeen(false);
  }

  async function handleFetchJoinedGroups() {
    if (!serverOnline) { alert("Server offline!"); return; }
    let dateFrom = joinedDateFromUtc || null;
    let dateTo = joinedDateToUtc || null;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      const tmp = dateFrom;
      dateFrom = dateTo;
      dateTo = tmp;
      setJoinedDateFromUtc(dateFrom);
      setJoinedDateToUtc(dateTo);
    }

    setFetchingJoined(true); setJoinedFetchLogs([]); setJoinedGroups([]); setSelectedGroups(new Set());
    if (tgJoinedSseRef.current) tgJoinedSseRef.current.close();
    const sse = new EventSource(`${SERVER}/api/tg/joined-stream`);
    tgJoinedSseRef.current = sse;
    sse.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.stage !== "joinedgroups") return;
      if (d.text) setJoinedFetchLogs(p => [...p, { type: d.type, text: d.text }]);
      if (d.type === "results") {
        const raw = d.groups || [];
        const all = raw.filter(g => {
          if (!dateFrom && !dateTo) return true;
          if (!g.joinedAtUtc) return false;
          const joined = String(g.joinedAtUtc).slice(0, 10);
          if (dateFrom && joined < dateFrom) return false;
          if (dateTo && joined > dateTo) return false;
          return true;
        });
        all.sort((a, b) => {
          const ad = a?.joinedAtUtc ? new Date(a.joinedAtUtc).getTime() : 0;
          const bd = b?.joinedAtUtc ? new Date(b.joinedAtUtc).getTime() : 0;
          return bd - ad;
        });
        const filteredOut = raw.length - all.length;
        if ((dateFrom || dateTo) && filteredOut > 0) {
          setJoinedFetchLogs(p => [...p, { type: "info", text: `Filtered out ${filteredOut} groups outside selected date range.` }]);
        }
        setJoinedGroups(all);
        setSelectedGroups(new Set(all.filter(g => !isGroupContacted(g) && !isGroupBlacklisted(g)).map(getGroupKey)));
        setFetchingJoined(false); sse.close();
      }
      if (d.type === "error") { setFetchingJoined(false); sse.close(); }
    };
    sse.onerror = () => { setFetchingJoined(false); sse.close(); };
    await new Promise(r => setTimeout(r, 400));
    await fetch(`${SERVER}/api/tg/fetch-joined-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFromUtc: dateFrom,
        dateToUtc: dateTo,
      }),
    });
  }

  async function handleTgAdminScrape() {
    let latestContacted = contacted;
    try {
      const d = await fetch(`${SERVER}/api/contacted`).then(r => r.json());
      latestContacted = new Set((d.contacted || []).map(u => (u.startsWith("@") ? u.toLowerCase() : `@${u.toLowerCase()}`)));
      setContacted(latestContacted);
    } catch {
      // ignore and use current set
    }

    const groups = joinedGroups
      .filter(g => selectedGroups.has(getGroupKey(g)))
      .map(g => g.ref || g.link)
      .filter(Boolean);
    if (!groups.length) { alert("No groups selected. Fetch groups first using your date filter."); return; }
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
    await fetch(`${SERVER}/api/tg/scrape-admins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groups,
        excludeUsernames: Array.from(latestContacted),
      }),
    });
  }

  function getAdmins(results, filter = "all") {
    return (results || []).flatMap(g => (g.members || [])
      .filter(m => filter === "all" || m.role.toLowerCase().includes(filter.toLowerCase()))
      .map(m => ({ ...m, groupName: g.groupName, groupLink: g.groupLink })));
  }

  function copyUsernames(results, filter) {
    const text = [...new Set(
      getAdmins(results, filter)
        .filter(m => m.username.startsWith("@") && !contacted.has(m.username.toLowerCase()))
        .map(m => m.username)
    )].join("\n");
    navigator.clipboard.writeText(text).then(() => { setTgAdminCopied(true); setTimeout(() => setTgAdminCopied(false), 2000); });
  }

  function copyGroupUsernames(group, rows) {
    const handles = [...new Set(
      (rows || [])
        .filter(m => m.username?.startsWith("@"))
        .map(m => m.username)
        .filter(u => !contacted.has(u.toLowerCase()))
    )];
    if (!handles.length) {
      alert("No new @handles in this group to copy.");
      return;
    }
    navigator.clipboard.writeText(handles.join("\n")).then(() => {
      const key = getTgGroupCopyKey(group);
      setTgGroupCopied(key);
      setTimeout(() => setTgGroupCopied(""), 1800);
    });
  }

  async function blacklistGroup(link) {
    if (!link) return;
    await fetch(`${SERVER}/api/blacklist-group`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
    setBlacklistedGroups(p => new Set([...p, link.toLowerCase()]));
    setJoinedGroups(p => p.filter(g => g.link?.toLowerCase() !== link.toLowerCase()));
    setSelectedGroups(p => {
      const n = new Set(p);
      for (const g of joinedGroups) {
        if (g.link?.toLowerCase() === link.toLowerCase()) n.delete(getGroupKey(g));
      }
      return n;
    });
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
      <header style={{ borderBottom: "1px solid #0f1a30", padding: isCompact ? "0 12px" : "0 32px", background: "rgba(5,8,16,0.95)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px)", display: "flex", alignItems: "stretch", flexWrap: isCompact ? "wrap" : "nowrap", rowGap: isCompact ? 6 : 0 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, paddingRight: isCompact ? 12 : 32, borderRight: isCompact ? "none" : "1px solid #0f1a30", minHeight: 58 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${GN}, ${BL})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, boxShadow: glow(GN, 10) }}>⚡</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "0.12em" }}>OUTREACH BOT</div>
            <div style={{ fontSize: 9, color: "#ddeeff", letterSpacing: "0.2em" }}>MOONSHOT WIN</div>
          </div>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: "flex", flex: isCompact ? "1 1 100%" : 1, overflowX: "auto", order: isCompact ? 3 : 0 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none", border: "none", borderBottom: tab === t ? `2px solid ${GN}` : "2px solid transparent",
              color: tab === t ? GN : "#7a9fc0", padding: isCompact ? "0 14px" : "0 20px", height: 58, cursor: "pointer", fontSize: 11,
              fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.1em", whiteSpace: "nowrap",
              textShadow: tab === t ? `0 0 12px ${GN}88` : "none", transition: "all 0.2s",
            }}>{t.toUpperCase()}</button>
          ))}
        </nav>

        {/* Status badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: isCompact ? 0 : 24, marginLeft: isCompact ? "auto" : 0, minHeight: 58, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
      <main style={{ padding: isCompact ? "18px 12px" : "28px 32px", maxWidth: 1280, margin: "0 auto" }}>

        {/* Offline banner */}
        {!serverOnline && (
          <div style={{ background: `${RD}10`, border: `1px solid ${RD}30`, borderRadius: 10, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, color: "#ffffff", fontSize: 13 }}>
            <span style={{ color: RD, fontWeight: 700 }}>⚠ Server offline —</span>
            run <code style={{ background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: 5, padding: "2px 8px", fontSize: 12 }}>node server.js</code>
          </div>
        )}

        {/* ─────────────────────────────────────────── TELEGRAM ─── */}
        {tab === "Telegram" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 28, alignItems: "start" }}>
            {/* Left: config */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>Telegram Outreach</h2>
                <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Direct message campaign via your TG account</p>
              </div>

              <div style={$.card}>
                <label style={$.label}>Usernames to DM — one per line</label>
                <textarea value={tgUsernames} onChange={e => setTgUsernames(e.target.value)} rows={9}
                  style={{ ...$.input, resize: "vertical" }} placeholder={"@username\n@username | Name | $TOKEN"} />
                <div style={{ color: "#ddeeff", fontSize: 11, marginTop: 8, letterSpacing: "0.05em" }}>
                  {tgUsernames.split("\n").filter(Boolean).length} targets queued
                </div>
                <div style={{ color: "#6a8aaa", fontSize: 10, marginTop: 6 }}>
                  Format: <code style={{ color: "#9ec4e8" }}>@username | Name | $TOKEN</code>
                </div>
              </div>

              <div style={$.card}>
                <label style={$.label}>Delay between messages</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "MIN", val: tgDelay, set: v => setTgDelay(v), min: 60, max: 240, color: GN },
                    { label: "MAX", val: tgDelayMax, set: v => setTgDelayMax(v), min: tgDelay, max: 300, color: GL },
                  ].map(({ label, val, set, min, max, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ color: "#ddeeff", fontSize: 10, letterSpacing: "0.1em", fontWeight: 700, width: 30 }}>{label}</span>
                      <input type="range" min={min} max={max} value={val} onChange={e => set(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color, cursor: "pointer" }} />
                      <span style={{ color, fontWeight: 800, fontSize: 18, minWidth: 48, textAlign: "right", textShadow: glow(color, 6) }}>{val}s</span>
                    </div>
                  ))}
                  <div style={{ color: "#ddeeff", fontSize: 11 }}>Random {tgDelay}-{tgDelayMax}s between each message (safety mode enforces >= 90s and cooldown breaks)</div>
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
              <TemplateEditor templates={tgTemplates} setTemplates={setTgTemplates} />
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────── DEX SCRAPER ─── */}
        {tab === "Dex Scraper" && (
          <div>
            <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>DexScreener Scraper</h2>
                <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Pulls 10 unique random tokens by your URL context and skips anything already scraped.</p>
              </div>
              <button
                onClick={handleClearDexSeenMemory}
                disabled={clearingDexSeen || !serverOnline}
                style={{ ...$.btnSm(RD), opacity: (clearingDexSeen || !serverOnline) ? 0.3 : 1 }}
              >
                {clearingDexSeen ? "CLEARING..." : "CLEAR UNIQUE MEMORY"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, maxWidth: 780, marginBottom: 14 }}>
              {[
                ["STEP 1", "Paste Dex URL"],
                ["STEP 2", "Scrape 10 Unique"],
                ["STEP 3", "Join TG Manually"],
                ["STEP 4", "Continue in TG Admins"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "linear-gradient(145deg, #061327, #041021)", border: "1px solid #123155", borderRadius: 10, padding: "10px 12px", boxShadow: "inset 0 1px 0 #ffffff08" }}>
                  <div style={{ color: BL, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em" }}>{k}</div>
                  <div style={{ color: "#dff2ff", marginTop: 4, fontSize: 12, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, maxWidth: 780, marginBottom: 20, flexWrap: "wrap" }}>
              <input value={dexUrl} onChange={e => setDexUrl(e.target.value)} style={{ ...$.input, flex: "1 1 460px", minWidth: 250 }}
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
              <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>Filter joined groups by UTC date range, then scrape admins/owners/mods you have not DMed yet.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
              {[
                ["STEP 1", "Pick UTC date range"],
                ["STEP 2", "Select groups to process"],
                ["STEP 3", "Scrape admins/mods/owners"],
                ["STEP 4", "Copy new @handles only"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "linear-gradient(145deg, #061327, #041021)", border: "1px solid #123155", borderRadius: 10, padding: "10px 12px", boxShadow: "inset 0 1px 0 #ffffff08" }}>
                  <div style={{ color: BL, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em" }}>{k}</div>
                  <div style={{ color: "#dff2ff", marginTop: 4, fontSize: 12, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 28 }}>
              {/* Step 1 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "linear-gradient(155deg, #051126, #040b1a)", border: "1px solid #123155", borderRadius: 14, padding: isCompact ? 12 : 14, boxShadow: glow(BL, 8) }}>
                <div style={{ color: GN, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>STEP 1 — FILTER GROUPS BY DATE (UTC)</div>
                <div style={{ background: "#071226", border: "1px solid #123155", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ color: "#b6d9ff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>DATE RANGE (UTC)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <input type="date" value={joinedDateFromUtc} onChange={e => setJoinedDateFromUtc(e.target.value)} style={{ ...$.input, width: isCompact ? "100%" : 170, padding: "8px 10px" }} />
                    <span style={{ color: "#6a8aaa", fontSize: 12 }}>to</span>
                    <input type="date" value={joinedDateToUtc} onChange={e => setJoinedDateToUtc(e.target.value)} style={{ ...$.input, width: isCompact ? "100%" : 170, padding: "8px 10px" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button onClick={() => applyJoinedDatePreset("today")} style={$.btnSm(BL)}>TODAY</button>
                    <button onClick={() => applyJoinedDatePreset("yesterday")} style={$.btnSm("#6fd6ff")}>YESTERDAY</button>
                    <button onClick={() => applyJoinedDatePreset("last7")} style={$.btnSm(GN)}>LAST 7D</button>
                    <button onClick={() => applyJoinedDatePreset("all")} style={$.btnSm("#3a5575")}>ALL</button>
                  </div>
                  <div style={{ color: "#9ec4e8", fontSize: 10 }}>
                    Active filter: {joinedDateFromUtc || "Any"} to {joinedDateToUtc || "Any"}
                  </div>
                </div>
                <button onClick={handleFetchJoinedGroups} disabled={fetchingJoined || !serverOnline}
                  style={{ ...$.btn(BL), opacity: (fetchingJoined || !serverOnline) ? 0.3 : 1 }}>
                  {fetchingJoined ? "FETCHING..." : "📡 FETCH GROUPS"}
                </button>
                <LogPane lines={joinedFetchLogs} placeholder="Set date filter, then fetch groups..." minH={80} maxH={110} />

                {joinedGroups.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#ddeeff", fontSize: 11, fontWeight: 700 }}>{selectedCount}/{joinedGroups.length} selected</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setSelectedGroups(new Set(joinedGroups.filter(g => !isGroupBlacklisted(g)).map(getGroupKey)))} style={$.btnSm(GN)}>ALL</button>
                        <button onClick={() => setSelectedGroups(new Set())} style={$.btnSm("#3a5575")}>NONE</button>
                      </div>
                    </div>
                    <div style={{ background: "#030609", border: "1px solid #0f1f35", borderRadius: 9, maxHeight: 300, overflowY: "auto" }}>
                      {joinedGroups.map((g, i) => {
                        const key = getGroupKey(g);
                        const checked = selectedGroups.has(key);
                        const dmed = isGroupContacted(g);
                        const bl = isGroupBlacklisted(g);
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", borderBottom: "1px solid #0a1020", opacity: bl ? 0.2 : 1 }}>
                            <div onClick={() => { if (bl) return; setSelectedGroups(p => { const n = new Set(p); checked ? n.delete(key) : n.add(key); return n; }); }}
                              style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${checked ? GN : "#1a2540"}`, background: checked ? GN : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: bl ? "not-allowed" : "pointer", transition: "all 0.15s" }}>
                              {checked && <span style={{ color: "#050810", fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0, cursor: bl ? "not-allowed" : "pointer" }}
                              onClick={() => { if (bl) return; setSelectedGroups(p => { const n = new Set(p); checked ? n.delete(key) : n.add(key); return n; }); }}>
                              <div style={{ color: "#ffffff", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                              <div style={{ color: "#ddeeff", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.link || "Private group (no public t.me link)"}</div>
                              {g.joinedAtUtc && <div style={{ color: "#6a8aaa", fontSize: 10 }}>joined: {new Date(g.joinedAtUtc).toISOString()}</div>}
                            </div>
                            {dmed && <Tag color={GL}>DMed</Tag>}
                            {g.participantsCount && <span style={{ color: "#ddeeff", fontSize: 10, flexShrink: 0 }}>{g.participantsCount.toLocaleString()}</span>}
                            {!bl && g.link && <button onClick={() => blacklistGroup(g.link)} style={{ ...$.btnSm(RD), padding: "3px 8px", flexShrink: 0 }}>✕</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "linear-gradient(155deg, #04171e, #04101a)", border: "1px solid #11624a", borderRadius: 14, padding: isCompact ? 12 : 14, boxShadow: glow(GN, 8) }}>
                <div style={{ color: GN, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em" }}>STEP 2 — SCRAPE ADMINS</div>
                <button onClick={handleTgAdminScrape} disabled={tgAdminScraping || !serverOnline || selectedCount === 0}
                  style={{ ...$.btn(GN), opacity: (tgAdminScraping || selectedCount === 0) ? 0.3 : 1 }}>
                  {tgAdminScraping ? "SCRAPING..." : `🔍 SCRAPE ${selectedCount} GROUP${selectedCount !== 1 ? "S" : ""}`}
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
                    <StatCard val={blockedAdmins.size} label="Blocked" color="#ff4466" />
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={queueTargetsFromAdminResults} style={$.btnSm(GN)}>QUEUE FOR DM</button>
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
                    {["all", "Owner", "Admin", "Moderator", "blocked"].map(f => (
                      <button key={f} onClick={() => setTgAdminFilter(f)}
                        style={{ ...$.btnSm(tgAdminFilter === f ? (f === "blocked" ? "#ff4466" : GN) : "#3a5575"), border: `1px solid ${tgAdminFilter === f ? (f === "blocked" ? "#ff446655" : GN + "55") : "#1a2540"}` }}>
                        {f === "all" ? "All" : f === "blocked" ? `🚫 Blocked (${blockedAdmins.size})` : f + "s"}{f !== "blocked" && f !== "all" ? ` (${getAdmins(tgAdminResults, f).length})` : ""}
                      </button>
                    ))}
                  </div>

                  {tgAdminResults.map((group, gi) => {
                    const filtered = group.members.filter(m => {
                      const u = (m.username?.startsWith("@") ? m.username : "@" + m.username).toLowerCase();
                      const isBlocked = blockedAdmins.has(u) || blockedAdmins.has(m.username?.toLowerCase());
                      if (tgAdminFilter === "blocked") return isBlocked;
                      if (isBlocked) return false; // hide blocked from all other views
                      return !contacted.has(u) && (tgAdminFilter === "all" || m.role.toLowerCase().includes(tgAdminFilter.toLowerCase()));
                    });
                    if (!filtered.length) return null;
                    const copyKey = getTgGroupCopyKey(group);
                    return (
                      <div key={gi} style={{ ...$.card, overflow: "hidden", marginBottom: 14 }}>
                        <div style={{ padding: "10px 18px", borderBottom: "1px solid #0f1a30", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#040710", margin: "-22px -26px 18px" }}>
                          <div>
                            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 14 }}>{group.groupName}</span>
                            {group.groupLink
                              ? <a href={group.groupLink} target="_blank" rel="noreferrer" style={{ color: BL, fontSize: 11, marginLeft: 10 }}>{group.groupLink} ↗</a>
                              : <span style={{ color: "#6a8aaa", fontSize: 11, marginLeft: 10 }}>private</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => copyGroupUsernames(group, filtered)} style={$.btnSm(BL)}>
                              {tgGroupCopied === copyKey ? "✓ COPIED" : "COPY GROUP @"}
                            </button>
                            <Tag color={GN}>{filtered.length} members</Tag>
                          </div>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #0f1a30" }}>
                              {["Username", "Display Name", "Role", ""].map(h => (
                                <th key={h} style={{ color: GL, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 16px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((m, mi) => {
                              const uKey = (m.username?.startsWith("@") ? m.username : "@" + m.username).toLowerCase();
                              const isBlocked = blockedAdmins.has(uKey) || blockedAdmins.has(m.username?.toLowerCase());
                              return (
                              <tr key={mi} style={{ borderBottom: "1px solid #070b18", opacity: isBlocked ? 0.45 : 1, background: isBlocked ? "#1a0010" : "transparent" }}>
                                <td style={{ padding: "9px 16px" }}>
                                  {m.username.startsWith("@")
                                    ? <a href={`https://t.me/${m.username.slice(1)}`} target="_blank" rel="noreferrer" style={{ color: isBlocked ? "#ff4466" : GN, fontWeight: 700, textDecoration: isBlocked ? "line-through" : "none", textShadow: glow(isBlocked ? "#ff4466" : GN, 6) }}>{m.username} ↗</a>
                                    : <span style={{ color: "#ddeeff", fontStyle: "italic" }}>{m.username}</span>}
                                </td>
                                <td style={{ color: isBlocked ? "#6a8aaa" : "#ffffff", padding: "9px 16px", textDecoration: isBlocked ? "line-through" : "none" }}>{m.displayName}</td>
                                <td style={{ padding: "9px 16px" }}>
                                  <Tag color={isBlocked ? "#ff4466" : m.role.startsWith("Owner") ? GL : m.role.startsWith("Mod") ? PU : BL}>
                                    {isBlocked ? "BLOCKED" : m.role}
                                  </Tag>
                                </td>
                                <td style={{ padding: "9px 16px", textAlign: "right" }}>
                                  {isBlocked ? (
                                    <button
                                      onClick={() => unblockAdmin(uKey)}
                                      title="Unblock this admin"
                                      style={{ background: "transparent", border: "1px solid #3a5575", borderRadius: 4, color: "#6a8aaa", cursor: "pointer", fontSize: 11, padding: "3px 8px", letterSpacing: "0.05em" }}>
                                      ↩ UNBLOCK
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => blockAdmin(uKey)}
                                      title="Block this admin — never show or queue again"
                                      style={{ background: "transparent", border: "1px solid #ff446633", borderRadius: 4, color: "#ff4466", cursor: "pointer", fontSize: 13, padding: "2px 7px", fontWeight: 700, lineHeight: 1 }}>
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
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
                          const isJoined = Boolean(r.tgLink && joinedTgLinks.has(String(r.tgLink).toLowerCase()));
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #070b18", opacity: isDone ? 0.3 : isJoined ? 0.45 : 1 }}>
                              <td style={{ color: "#ddeeff", padding: "9px 16px", fontSize: 11 }}>{String(i + 1).padStart(2, "0")}</td>
                              <td style={{ padding: "9px 16px", maxWidth: 200 }}>
                                <div style={{ color: isDone ? "#6a8aaa" : "#e8f0ff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none" }}>{r.name}</div>
                                {r.chainId && <div style={{ color: "#ddeeff", fontSize: 10 }}>{r.chainId}</div>}
                              </td>
                              <td style={{ padding: "9px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                                <SocialLink href={r.tgLink} label="TG" color={GN} />
                                {isJoined && <Tag color="#3a5575">Joined</Tag>}
                              </td>
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
                <div style={$.card}><ResultsTable results={viewingEntry.results} doneProjects={doneProjects} joinedLinks={joinedTgLinks} /></div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: 22, fontWeight: 700 }}>Scrape History</h2>
                    <p style={{ margin: "5px 0 0", color: "#ddeeff", fontSize: 13 }}>All previous DexScreener scrapes</p>
                  </div>
                  <div style={{ display: "flex", gap: 9 }}>
                    {tgAuth.loggedIn && (
                      <button onClick={refreshJoinedTgLinks} disabled={joinedLinksLoading} style={{ ...$.btnSm("#3a5575"), opacity: joinedLinksLoading ? 0.45 : 1 }}>
                        {joinedLinksLoading ? "SYNCING JOINED..." : "SYNC JOINED GROUPS"}
                      </button>
                    )}
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

                        <div style={{ ...$.card, padding: "14px 18px", background: "#02060d", border: "1px solid #103155" }}>
              <div style={{ color: GL, fontSize: 10, letterSpacing: "0.18em", marginBottom: 10, fontWeight: 700 }}>
                TERMINAL LOGS
              </div>
              {(liveLines.length > 0
                ? liveLines.map((line, i) => ({
                    key: `live-${i}`,
                    text: String(line),
                    isError: /failed|error|peer_flood|flood_wait|denied|forbidden/i.test(String(line)),
                  }))
                : logs.map((log, i) => ({
                    key: `hist-${i}`,
                    text: `[${log.time}] [${log.platform}] ${log.target} [${log.status}] ${log.message}`,
                    isError: String(log.status || "").toLowerCase() === "failed",
                  }))
              ).map((row) => (
                <div
                  key={row.key}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: row.isError ? "#ff5c5c" : "#56ff9a",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {row.text}
                </div>
              ))}
              {liveLines.length === 0 && logs.length === 0 && (
                <div style={{ color: "#56ff9a", fontFamily: "monospace", fontSize: 13 }}>
                  No logs yet - run a campaign from the Telegram tab
                </div>
              )}
              <div ref={liveLines.length > 0 ? liveEndRef : logsEndRef} />
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