require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

let botProcess = null;
let liveClients = [];
let dexClients = [];
let tgScrapeClients = [];
let tgJoinedClients = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function broadcast(data) { const p = `data: ${JSON.stringify(data)}\n\n`; liveClients.forEach(c => c.write(p)); }
function broadcastDex(data) { const p = `data: ${JSON.stringify(data)}\n\n`; dexClients.forEach(c => c.write(p)); }
function broadcastTg(data) { const p = `data: ${JSON.stringify(data)}\n\n`; tgScrapeClients.forEach(c => c.write(p)); }
function broadcastJoined(data) { const p = `data: ${JSON.stringify(data)}\n\n`; tgJoinedClients.forEach(c => c.write(p)); }

// ─── Bot routes ───────────────────────────────────────────────────────────────
app.post("/api/campaign", (req, res) => {
  try { fs.writeFileSync(path.join(__dirname, "campaign.json"), JSON.stringify(req.body, null, 2)); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/run", (req, res) => {
  if (botProcess) return res.status(400).json({ ok: false, error: "Bot already running" });
  // Don't wipe logs — preserve contacted history
  const existingLogs = fs.existsSync(path.join(__dirname, "logs.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "logs.json"))) : [];
  fs.writeFileSync(path.join(__dirname, "logs.json"), JSON.stringify(existingLogs, null, 2));
  botProcess = spawn("node", ["bot.js"], { cwd: __dirname, env: { ...process.env } });
  botProcess.stdout.on("data", (data) => { broadcast({ type: "log", text: data.toString() }); });
  botProcess.stderr.on("data", (data) => { broadcast({ type: "log", text: data.toString() }); });
  botProcess.on("close", (code) => { broadcast({ type: "done", text: `\n✅ Bot finished (exit ${code})` }); botProcess = null; });
  res.json({ ok: true });
});

app.post("/api/stop", (req, res) => {
  if (!botProcess) return res.status(400).json({ ok: false, error: "Bot not running" });
  botProcess.kill(); botProcess = null;
  broadcast({ type: "done", text: "🛑 Stopped" });
  res.json({ ok: true });
});

app.get("/api/status", (req, res) => res.json({ running: botProcess !== null }));

app.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  liveClients.push(res);
  req.on("close", () => { liveClients = liveClients.filter(c => c !== res); });
});

app.get("/api/logs", (req, res) => {
  const f = path.join(__dirname, "logs.json");
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);
});

// ─── DexScreener routes ───────────────────────────────────────────────────────
app.get("/api/dex/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  dexClients.push(res);
  req.on("close", () => { dexClients = dexClients.filter(c => c !== res); });
});

app.post("/api/dex/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: "URL required" });
  res.json({ ok: true });
  delete require.cache[require.resolve("./dexscraper")];
  const { scrapeDexScreener } = require("./dexscraper");
  try {
    const { results, historyEntry } = await scrapeDexScreener(url, (p) => broadcastDex({ ...p, stage: "scrape" }));
    await new Promise(r => setTimeout(r, 500));
    broadcastDex({ type: "results", results, historyEntry, stage: "scrape" });
  } catch (err) {
    broadcastDex({ type: "error", text: `Scrape failed: ${err.message}`, stage: "scrape" });
  }
});

app.delete("/api/dex/seen/clear", (req, res) => {
  try {
    delete require.cache[require.resolve("./dexscraper")];
    const { clearDexSeenMemory } = require("./dexscraper");
    clearDexSeenMemory();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/dex/results", (req, res) => {
  const f = path.join(__dirname, "dex_results.json");
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);
});

app.get("/api/dex/history", (req, res) => {
  const f = path.join(__dirname, "dex_history.json");
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);
});

// ─── TG Group Admin Scraper ───────────────────────────────────────────────────
app.get("/api/tg/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  tgScrapeClients.push(res);
  req.on("close", () => { tgScrapeClients = tgScrapeClients.filter(c => c !== res); });
});

app.post("/api/tg/scrape-admins", async (req, res) => {
  const { groups, excludeUsernames } = req.body;
  if (!groups?.length) return res.status(400).json({ ok: false, error: "No groups provided" });
  res.json({ ok: true });
  delete require.cache[require.resolve("./tgscraper")];
  const { scrapeGroupAdmins } = require("./tgscraper");
  try {
    const results = await scrapeGroupAdmins(
      groups,
      (p) => broadcastTg({ ...p, stage: "tgscrape" }),
      { excludeUsernames }
    );
    const entry = { id: Date.now(), scrapedAt: new Date().toISOString(), results };
    const histFile = path.join(__dirname, "tg_admin_history.json");
    const hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile)) : [];
    hist.unshift(entry);
    fs.writeFileSync(histFile, JSON.stringify(hist.slice(0, 30), null, 2));
    broadcastTg({ type: "results", results, entry, stage: "tgscrape" });
  } catch (err) {
    broadcastTg({ type: "error", text: `Failed: ${err.message}`, stage: "tgscrape" });
  }
});

app.get("/api/tg/admin-history", (req, res) => {
  const f = path.join(__dirname, "tg_admin_history.json");
  res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);
});

// ─── Fetch Joined Groups ──────────────────────────────────────────────────────
app.get("/api/tg/joined-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  tgJoinedClients.push(res);
  req.on("close", () => { tgJoinedClients = tgJoinedClients.filter(c => c !== res); });
});

app.post("/api/tg/fetch-joined-groups", async (req, res) => {
  res.json({ ok: true });
  delete require.cache[require.resolve("./tgscraper")];
  const { fetchJoinedGroups } = require("./tgscraper");
  try {
    const { dateFromUtc, dateToUtc } = req.body || {};
    const groups = await fetchJoinedGroups(
      (p) => broadcastJoined({ ...p, stage: "joinedgroups" }),
      { dateFromUtc, dateToUtc }
    );
    broadcastJoined({ type: "results", groups, stage: "joinedgroups" });
  } catch (err) {
    broadcastJoined({ type: "error", text: `Failed: ${err.message}`, stage: "joinedgroups" });
  }
});

app.get("/api/tg/joined-links", async (req, res) => {
  delete require.cache[require.resolve("./tgscraper")];
  const { fetchJoinedGroups } = require("./tgscraper");
  try {
    const groups = await fetchJoinedGroups(null, { includeJoinDates: false });
    const links = groups
      .map((g) => (g?.link ? String(g.link).toLowerCase() : ""))
      .filter(Boolean);
    res.json({ ok: true, links: [...new Set(links)] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, links: [] });
  }
});


// ─── Contacted / Dedup ────────────────────────────────────────────────────────
app.get("/api/contacted", (req, res) => {
  // Returns all usernames ever successfully DMed (status === "sent"), normalized with @
  const logsFile = path.join(__dirname, "logs.json");
  const logs = fs.existsSync(logsFile) ? JSON.parse(fs.readFileSync(logsFile)) : [];
  const contacted = [...new Set(
    logs
      .filter(l => l.status === "sent" && l.target)
      .map(l => {
        const t = l.target.toLowerCase().trim();
        return t.startsWith("@") ? t : "@" + t;
      })
  )].filter(Boolean);
  res.json({ contacted });
});

app.delete("/api/history/clear", (req, res) => {
  try {
    const files = ["logs.json", "dex_history.json", "tg_admin_history.json", "dex_results.json", "dex_seen.json"];
    files.forEach(f => {
      const fp = path.join(__dirname, f);
      if (fs.existsSync(fp)) fs.writeFileSync(fp, f.endsWith("history.json") || f === "dex_results.json" ? "[]" : "[]");
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Blacklist Groups ─────────────────────────────────────────────────────────
app.get("/api/blacklisted-groups", (req, res) => {
  const f = path.join(__dirname, "blacklisted_groups.json");
  const groups = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  res.json({ groups });
});

app.post("/api/blacklist-group", (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ ok: false });
  const f = path.join(__dirname, "blacklisted_groups.json");
  const groups = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  if (!groups.includes(link.toLowerCase())) groups.push(link.toLowerCase());
  fs.writeFileSync(f, JSON.stringify(groups, null, 2));
  res.json({ ok: true });
});

// ─── Blocked Admins (TG Admin scraper — never show/scrape again) ──────────────
app.get("/api/blocked-admins", (req, res) => {
  const f = path.join(__dirname, "blocked_admins.json");
  const admins = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  res.json({ admins });
});

app.post("/api/block-admin", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false });
  const f = path.join(__dirname, "blocked_admins.json");
  const admins = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  const key = String(username).toLowerCase().trim();
  if (!admins.includes(key)) admins.push(key);
  fs.writeFileSync(f, JSON.stringify(admins, null, 2));
  res.json({ ok: true });
});

app.delete("/api/block-admin", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false });
  const f = path.join(__dirname, "blocked_admins.json");
  const admins = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  const key = String(username).toLowerCase().trim();
  const updated = admins.filter(a => a !== key);
  fs.writeFileSync(f, JSON.stringify(updated, null, 2));
  res.json({ ok: true });
});

// ─── Delete single history entry ─────────────────────────────────────────────
app.post("/api/dex/history/delete", (req, res) => {
  const { id } = req.body;
  const f = path.join(__dirname, "dex_history.json");
  const hist = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  const updated = hist.filter(e => e.id !== id);
  fs.writeFileSync(f, JSON.stringify(updated, null, 2));
  res.json({ ok: true });
});

// ─── Done Projects (mark as contacted in DEX view) ────────────────────────────
app.get("/api/done-projects", (req, res) => {
  const f = path.join(__dirname, "done_projects.json");
  const projects = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  res.json({ projects });
});

app.post("/api/done-project", (req, res) => {
  const { key } = req.body; // key = project name or tgLink used as unique ID
  if (!key) return res.status(400).json({ ok: false });
  const f = path.join(__dirname, "done_projects.json");
  const projects = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  if (!projects.includes(key.toLowerCase())) projects.push(key.toLowerCase());
  fs.writeFileSync(f, JSON.stringify(projects, null, 2));
  res.json({ ok: true });
});

app.delete("/api/done-project", (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false });
  const f = path.join(__dirname, "done_projects.json");
  const projects = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  const updated = projects.filter(p => p !== key.toLowerCase());
  fs.writeFileSync(f, JSON.stringify(updated, null, 2));
  res.json({ ok: true });
});

// ─── Auth: Telegram login flow ───────────────────────────────────────────────
// Step 0: check TG session status
app.get("/api/auth/tg/status", (req, res) => {
  const sessionFile = path.join(__dirname, ".tg_session");
  const credsFile = path.join(__dirname, "tg_credentials.json");
  const hasSession = fs.existsSync(sessionFile) && fs.readFileSync(sessionFile, "utf-8").trim().length > 10;
  const creds = fs.existsSync(credsFile) ? JSON.parse(fs.readFileSync(credsFile)) : {};
  res.json({ loggedIn: hasSession, phone: creds.phone || null, apiId: creds.apiId || null });
});

// Step 1: save API credentials + send OTP
let _tgLoginClient = null;
app.post("/api/auth/tg/send-code", async (req, res) => {
  const { apiId, apiHash, phone } = req.body;
  if (!apiId || !apiHash || !phone) return res.status(400).json({ ok: false, error: "apiId, apiHash, phone required" });
  try {
    const { TelegramClient } = require("telegram");
    const { StringSession } = require("telegram/sessions");
    if (_tgLoginClient) { try { await _tgLoginClient.disconnect(); } catch {} }
    _tgLoginClient = new TelegramClient(new StringSession(""), parseInt(apiId), apiHash, { connectionRetries: 3 });
    await _tgLoginClient.connect();
    const result = await _tgLoginClient.sendCode({ apiId: parseInt(apiId), apiHash }, phone);
    // save creds for future use
    fs.writeFileSync(path.join(__dirname, "tg_credentials.json"), JSON.stringify({ apiId, apiHash, phone }, null, 2));
    // store phoneCodeHash in memory
    _tgLoginClient._pendingPhoneCodeHash = result.phoneCodeHash;
    res.json({ ok: true, phoneCodeHash: result.phoneCodeHash });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Step 2: verify OTP (and optional 2FA password)
app.post("/api/auth/tg/verify-code", async (req, res) => {
  const { code, password } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: "OTP code required" });
  if (!_tgLoginClient) return res.status(400).json({ ok: false, error: "No pending login — send code first" });
  try {
    const { StringSession } = require("telegram/sessions");
    const creds = JSON.parse(fs.readFileSync(path.join(__dirname, "tg_credentials.json")));
    const phoneCodeHash = _tgLoginClient._pendingPhoneCodeHash;
    await _tgLoginClient.invoke(new (require("telegram").Api.auth.SignIn)({
      phoneNumber: creds.phone,
      phoneCodeHash,
      phoneCode: code.trim(),
    })).catch(async (err) => {
      // Handle 2FA
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        if (!password) throw new Error("2FA_REQUIRED");
        const { computeCheck } = require("telegram/Password");
        const srp = await _tgLoginClient.invoke(new (require("telegram").Api.account.GetPassword)());
        const check = await computeCheck(srp, password);
        await _tgLoginClient.invoke(new (require("telegram").Api.auth.CheckPassword)({ password: check }));
      } else {
        throw err;
      }
    });
    // Save session
    const session = _tgLoginClient.session.save();
    fs.writeFileSync(path.join(__dirname, ".tg_session"), session);
    await _tgLoginClient.disconnect();
    _tgLoginClient = null;
    res.json({ ok: true });
  } catch (err) {
    if (err.message === "2FA_REQUIRED") {
      res.json({ ok: false, need2FA: true, error: "2FA password required" });
    } else {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

// Logout TG
app.post("/api/auth/tg/logout", async (req, res) => {
  const sessionFile = path.join(__dirname, ".tg_session");
  const credsFile = path.join(__dirname, "tg_credentials.json");
  if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
  if (fs.existsSync(credsFile)) fs.unlinkSync(credsFile);
  if (_tgLoginClient) { try { await _tgLoginClient.disconnect(); } catch {} _tgLoginClient = null; }
  res.json({ ok: true });
});

// ─── Serve React frontend (MUST BE LAST) ─────────────────────────────────────
const buildPath = path.join(__dirname, "outreach-ui", "build");
const indexFile = path.join(buildPath, "index.html");
if (fs.existsSync(indexFile)) {
  app.use(express.static(buildPath));
  app.get("/{*path}", (req, res) => {
    res.sendFile(indexFile);
  });
} else {
  app.get("/", (req, res) => {
    res.type("text/plain").send("Outreach API running. Frontend build not found. Run: npm run build --prefix outreach-ui");
  });
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ Outreach server running on port ${PORT}`);
});