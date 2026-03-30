/**
 * outreach bot - bot.js
 * Reads campaign.json exported from the React dashboard
 * Runs Telegram outreach with safety guards.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const input = require("input");

const LOGS_PATH = path.join(__dirname, "logs.json");
const CONFIG_PATH = path.join(__dirname, "campaign.json");
const SAFETY_STATE_PATH = path.join(__dirname, "tg_safety_state.json");

process.on("unhandledRejection", (reason) => {
  if (reason?.message === "TIMEOUT" || String(reason).includes("TIMEOUT")) return;
  console.error("Unhandled rejection:", reason);
});

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minSeconds, maxSeconds) {
  const min = Math.max(1, toInt(minSeconds, 60));
  const max = Math.max(min, toInt(maxSeconds, Math.max(min + 30, 90)));
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

function readLogs() {
  if (!fs.existsSync(LOGS_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(LOGS_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLog(entry) {
  const logs = readLogs();
  logs.push(entry);
  fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2));
}

function log(platform, target, status, message = "") {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${platform}] ${target} [${status}] ${message}`);
  appendLog({ time, ts: new Date().toISOString(), platform, target, status, message });
}

function readSafetyState() {
  if (!fs.existsSync(SAFETY_STATE_PATH)) {
    return { daily: { day: "", sent: 0 }, cooldownUntilMs: 0 };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(SAFETY_STATE_PATH, "utf-8"));
    return {
      daily: {
        day: String(parsed?.daily?.day || ""),
        sent: Math.max(0, toInt(parsed?.daily?.sent, 0)),
      },
      cooldownUntilMs: Math.max(0, toInt(parsed?.cooldownUntilMs, 0)),
      lastPeerFloodAt: parsed?.lastPeerFloodAt || "",
      lastPeerFloodError: parsed?.lastPeerFloodError || "",
      lastStopReason: parsed?.lastStopReason || "",
    };
  } catch {
    return { daily: { day: "", sent: 0 }, cooldownUntilMs: 0 };
  }
}

function writeSafetyState(state) {
  fs.writeFileSync(SAFETY_STATE_PATH, JSON.stringify(state, null, 2));
}

function utcDayKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function ensureDailyWindow(state) {
  const day = utcDayKey();
  if (state.daily.day !== day) {
    state.daily.day = day;
    state.daily.sent = 0;
  }
}

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function buildPeerFloodReason(details) {
  const reasons = [
    "Likely cause: Telegram anti-spam flagged this as cold outreach to users who may not have interacted with your account yet.",
  ];
  if (details.attempts <= 8) {
    reasons.push("A short burst of new outbound DMs can trigger PEER_FLOOD quickly.");
  }
  if (details.minDelaySeconds < 140) {
    reasons.push("Delay between messages is still relatively aggressive for first-contact outreach.");
  }
  if (details.newContactsCount > 0 && details.skippedHistory <= 1) {
    reasons.push("Most recipients in this run were first-time contacts.");
  }
  if (details.dailySent >= Math.max(1, Math.floor(details.maxDmPerDay * 0.6))) {
    reasons.push("Daily outbound volume is already high for this account trust level.");
  }
  reasons.push(
    `Evidence: attempts=${details.attempts}, sent=${details.sent}, failures=${details.failures}, newContacts=${details.newContactsCount}, delay=${details.minDelaySeconds}-${details.maxDelaySeconds}s, daily=${details.dailySent}/${details.maxDmPerDay}.`
  );
  return reasons.join(" ");
}

function normalizeUsername(raw) {
  if (!raw) return "";
  const value = String(raw).trim();
  if (!value) return "";
  if (/^https?:\/\/t\.me\//i.test(value)) {
    const match = value.match(/(?:https?:\/\/)?t\.me\/([^/?#\s]+)/i);
    if (!match) return "";
    return `@${match[1]}`.toLowerCase();
  }
  const withAt = value.startsWith("@") ? value : `@${value}`;
  return withAt.toLowerCase();
}

function classifyTelegramError(err) {
  const raw = String(err?.errorMessage || err?.message || err || "");
  const upper = raw.toUpperCase();
  const floodWaitMatch = upper.match(/FLOOD_WAIT_?(\d+)/);
  return {
    raw,
    isPeerFlood: upper.includes("PEER_FLOOD"),
    isFloodWait: upper.includes("FLOOD_WAIT"),
    floodWaitSeconds: floodWaitMatch ? Number(floodWaitMatch[1]) : null,
    isPrivacyRestricted: upper.includes("USER_PRIVACY_RESTRICTED"),
    isBlockedByUser: upper.includes("YOU_BLOCKED_USER") || upper.includes("USER_IS_BLOCKED"),
  };
}

function buildSafetyConfig(campaignSafety = {}) {
  const cfg = {
    stopOnPeerFlood: campaignSafety.stopOnPeerFlood !== false,
    skipPreviouslyMessaged: campaignSafety.skipPreviouslyMessaged !== false,
    maxDmPerRun: Math.max(1, toInt(campaignSafety.maxDmPerRun, toInt(process.env.TG_MAX_DM_PER_RUN, 15))),
    maxDmPerDay: Math.max(1, toInt(campaignSafety.maxDmPerDay, toInt(process.env.TG_MAX_DM_PER_DAY, 30))),
    maxFailuresPerRun: Math.max(1, toInt(campaignSafety.maxFailuresPerRun, toInt(process.env.TG_MAX_FAILURES_PER_RUN, 4))),
    minDelaySeconds: Math.max(45, toInt(campaignSafety.minDelaySeconds, toInt(process.env.TG_SAFE_MIN_DELAY_SECONDS, 90))),
    maxDelaySeconds: Math.max(60, toInt(campaignSafety.maxDelaySeconds, toInt(process.env.TG_SAFE_MAX_DELAY_SECONDS, 180))),
    coldLeadMinDelaySeconds: Math.max(90, toInt(campaignSafety.coldLeadMinDelaySeconds, toInt(process.env.TG_COLD_MIN_DELAY_SECONDS, 140))),
    breakEvery: Math.max(1, toInt(campaignSafety.breakEvery, toInt(process.env.TG_BREAK_EVERY, 4))),
    breakMinSeconds: Math.max(30, toInt(campaignSafety.breakMinSeconds, toInt(process.env.TG_BREAK_MIN_SECONDS, 180))),
    breakMaxSeconds: Math.max(45, toInt(campaignSafety.breakMaxSeconds, toInt(process.env.TG_BREAK_MAX_SECONDS, 420))),
    peerFloodCooldownMinutes: Math.max(
      10,
      toInt(campaignSafety.peerFloodCooldownMinutes, toInt(process.env.TG_PEER_FLOOD_COOLDOWN_MINUTES, 720))
    ),
    floodWaitBufferSeconds: Math.max(
      30,
      toInt(campaignSafety.floodWaitBufferSeconds, toInt(process.env.TG_FLOOD_WAIT_BUFFER_SECONDS, 120))
    ),
  };
  if (cfg.maxDelaySeconds < cfg.minDelaySeconds) cfg.maxDelaySeconds = cfg.minDelaySeconds;
  if (cfg.coldLeadMinDelaySeconds > cfg.maxDelaySeconds) cfg.maxDelaySeconds = cfg.coldLeadMinDelaySeconds;
  if (cfg.breakMaxSeconds < cfg.breakMinSeconds) cfg.breakMaxSeconds = cfg.breakMinSeconds;
  return cfg;
}

function normalizeTokenName(raw, fallback = "$TOKEN") {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (value.startsWith("$")) return value.toUpperCase();
  return `$${value}`.toUpperCase();
}

function parseTargetLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null;
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  const username = normalizeUsername(parts[0] || "");
  if (!username) return null;

  let name = "";
  let tokenName = "";
  if (parts.length >= 2) {
    if (parts[1].startsWith("$")) tokenName = parts[1];
    else name = parts[1];
  }
  if (parts.length >= 3) {
    if (!tokenName) tokenName = parts[2];
    else if (!name) name = parts[2];
  }

  return {
    username,
    name: name || "there",
    tokenName: normalizeTokenName(tokenName || "$TOKEN"),
  };
}

function dedupeTargets(targets) {
  const seen = new Set();
  const result = [];
  for (const item of safeArray(targets)) {
    const username = normalizeUsername(item?.username || item);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    result.push({
      username,
      name: String(item?.name || "there").trim() || "there",
      tokenName: normalizeTokenName(item?.tokenName || "$TOKEN"),
    });
  }
  return result;
}

function buildDmTargets(telegramConfig) {
  const explicitTargets = safeArray(telegramConfig?.targets).map((t) => ({
    username: t?.username,
    name: t?.name,
    tokenName: t?.tokenName,
  }));
  if (explicitTargets.length > 0) {
    return dedupeTargets(explicitTargets);
  }
  const parsed = safeArray(telegramConfig?.usernames).map(parseTargetLine).filter(Boolean);
  return dedupeTargets(parsed);
}

function renderDmMessage(template, target) {
  const body = String(template || "").trim();
  return body
    .replaceAll("[NAME]", target?.name || "there")
    .replaceAll("[TOKEN NAME]", target?.tokenName || "$TOKEN");
}

function getPreviouslyMessagedSet() {
  const sent = new Set();
  for (const row of readLogs()) {
    if (row?.platform !== "Telegram DM") continue;
    if (row?.status !== "sent") continue;
    const key = normalizeUsername(row?.target);
    if (key) sent.add(key);
  }
  return sent;
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error("campaign.json not found. Export it from the React dashboard first.");
  process.exit(1);
}

const campaign = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const telegram = campaign?.telegram || {};
const tgTemplateList = safeArray(campaign?.tgTemplates);
const templateShuffle = campaign?.templateShuffle !== false;
const safety = buildSafetyConfig(campaign?.safety || {});

const DEFAULT_TEMPLATES = [
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

function sanitizeTemplateList(list) {
  const clean = safeArray(list)
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  return clean.length ? clean : DEFAULT_TEMPLATES;
}

const preparedTemplateList = sanitizeTemplateList(tgTemplateList);
let templateIndex = 0;
let lastTemplateIdx = -1;
let shuffleBag = [];

function nextTgTemplate() {
  if (preparedTemplateList.length === 1) return preparedTemplateList[0];

  if (templateShuffle) {
    if (!shuffleBag.length) {
      shuffleBag = [...Array(preparedTemplateList.length).keys()];
      for (let i = shuffleBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
      }
      if (shuffleBag.length > 1 && shuffleBag[0] === lastTemplateIdx) {
        [shuffleBag[0], shuffleBag[1]] = [shuffleBag[1], shuffleBag[0]];
      }
    }
    const pickedIndex = shuffleBag.shift();
    lastTemplateIdx = pickedIndex;
    return preparedTemplateList[pickedIndex];
  }

  const idx = templateIndex % preparedTemplateList.length;
  templateIndex++;
  lastTemplateIdx = idx;
  return preparedTemplateList[idx];
}

async function runTelegram() {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");

  const apiId = parseInt(process.env.TG_API_ID, 10);
  const apiHash = process.env.TG_API_HASH;
  if (!apiId || !apiHash) {
    log("Telegram", "AUTH", "failed", "TG_API_ID or TG_API_HASH missing in .env");
    return;
  }

  const sessionFile = path.join(__dirname, ".tg_session");
  const savedSession = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf-8").trim() : "";
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => process.env.TG_PHONE || input.text("Telegram phone number: "),
    password: async () => input.text("2FA password (if enabled, else press Enter): "),
    phoneCode: async () => input.text("Enter the Telegram code: "),
    onError: (err) => console.error("Telegram auth error:", err),
  });

  fs.writeFileSync(sessionFile, client.session.save());
  log("Telegram", "AUTH", "info", "Session ready");

  let hardStopReason = "";
  let failures = 0;
  let dmsSentThisRun = 0;
  let attempts = 0;
  const safetyState = readSafetyState();
  ensureDailyWindow(safetyState);
  const configuredMin = Math.max(toInt(telegram?.delaySeconds, 60), safety.minDelaySeconds);
  const configuredMax = Math.max(toInt(telegram?.delaySecondsMax, 90), safety.maxDelaySeconds, configuredMin);

  try {
    const nowMs = Date.now();
    writeSafetyState(safetyState);

    if (safetyState.cooldownUntilMs > nowMs) {
      const remainingMs = safetyState.cooldownUntilMs - nowMs;
      log(
        "Telegram Safety",
        "COOLDOWN",
        "failed",
        `Run blocked: cooldown active for ${formatMs(remainingMs)} (until ${new Date(safetyState.cooldownUntilMs).toISOString()}).`
      );
      if (safetyState.lastPeerFloodError) {
        log("Telegram Safety", "LAST_ERROR", "info", `Previous flood signal: ${safetyState.lastPeerFloodError}`);
      }
      return;
    }

    const dailyRemaining = Math.max(0, safety.maxDmPerDay - safetyState.daily.sent);
    if (dailyRemaining <= 0) {
      log(
        "Telegram Safety",
        "DAILY_CAP",
        "failed",
        `Daily DM cap reached for UTC day ${safetyState.daily.day} (${safetyState.daily.sent}/${safety.maxDmPerDay}).`
      );
      return;
    }

    log(
      "Telegram Safety",
      "CONFIG",
      "info",
      `maxDmPerRun=${safety.maxDmPerRun}, maxDmPerDay=${safety.maxDmPerDay}, remainingToday=${dailyRemaining}, maxFailuresPerRun=${safety.maxFailuresPerRun}, delay=${configuredMin}-${configuredMax}s, breakEvery=${safety.breakEvery}, break=${safety.breakMinSeconds}-${safety.breakMaxSeconds}s, templates=${preparedTemplateList.length}, templateMode=${templateShuffle ? "shuffle" : "sequence"}`
    );

    const uniqueTargets = buildDmTargets(telegram);
    const previouslyMessaged = safety.skipPreviouslyMessaged ? getPreviouslyMessagedSet() : new Set();
    const filteredForFresh = uniqueTargets.filter((t) => !previouslyMessaged.has(normalizeUsername(t.username)));
    const runLimitedTargets = filteredForFresh.slice(0, safety.maxDmPerRun);
    const dmTargets = runLimitedTargets.slice(0, dailyRemaining);
    const coldLeadMode = filteredForFresh.length > 0 && filteredForFresh.length === uniqueTargets.length;
    const effectiveMinDelay = coldLeadMode ? Math.max(configuredMin, safety.coldLeadMinDelaySeconds) : configuredMin;
    const effectiveMaxDelay = Math.max(configuredMax, effectiveMinDelay);

    const skippedByHistory = uniqueTargets.length - filteredForFresh.length;
    const skippedByRunCap = filteredForFresh.length - runLimitedTargets.length;
    const skippedByDailyCap = runLimitedTargets.length - dmTargets.length;

    if (skippedByHistory > 0) {
      log("Telegram Safety", "FILTER", "info", `Skipped ${skippedByHistory} usernames already messaged earlier`);
    }
    if (skippedByRunCap > 0) {
      log("Telegram Safety", "FILTER", "info", `Skipped ${skippedByRunCap} usernames due to maxDmPerRun cap`);
    }
    if (skippedByDailyCap > 0) {
      log(
        "Telegram Safety",
        "FILTER",
        "info",
        `Skipped ${skippedByDailyCap} usernames due to daily cap (${safetyState.daily.sent}/${safety.maxDmPerDay} used).`
      );
    }
    if (coldLeadMode && dmTargets.length > 0) {
      log(
        "Telegram Safety",
        "WARN",
        "info",
        `All selected targets are first-contact leads. Using stricter delay=${effectiveMinDelay}-${effectiveMaxDelay}s.`
      );
    }

    for (let i = 0; i < dmTargets.length; i++) {
      const target = dmTargets[i];
      const username = target.username;
      attempts++;
      try {
        const message = renderDmMessage(nextTgTemplate(), target);
        await client.sendMessage(username, { message });
        dmsSentThisRun++;
        safetyState.daily.sent++;
        writeSafetyState(safetyState);
        log("Telegram DM", username, "sent", message.slice(0, 80));
      } catch (err) {
        failures++;
        const info = classifyTelegramError(err);
        log("Telegram DM", username, "failed", info.raw);

        if (safety.stopOnPeerFlood && (info.isPeerFlood || info.isFloodWait)) {
          hardStopReason = info.isPeerFlood
            ? "PEER_FLOOD detected by Telegram"
            : `FLOOD_WAIT detected (${info.floodWaitSeconds || "unknown"}s)`;

          const reason = buildPeerFloodReason({
            attempts,
            sent: dmsSentThisRun,
            failures,
            minDelaySeconds: effectiveMinDelay,
            maxDelaySeconds: effectiveMaxDelay,
            newContactsCount: filteredForFresh.length,
            skippedHistory: skippedByHistory,
            dailySent: safetyState.daily.sent,
            maxDmPerDay: safety.maxDmPerDay,
          });
          log("Telegram Safety", "REASON", "failed", reason);

          const cooldownSeconds = info.isFloodWait && info.floodWaitSeconds
            ? info.floodWaitSeconds + safety.floodWaitBufferSeconds
            : safety.peerFloodCooldownMinutes * 60;
          safetyState.cooldownUntilMs = Date.now() + cooldownSeconds * 1000;
          safetyState.lastPeerFloodAt = new Date().toISOString();
          safetyState.lastPeerFloodError = info.raw;
          safetyState.lastStopReason = hardStopReason;
          writeSafetyState(safetyState);

          log(
            "Telegram Safety",
            "COOLDOWN",
            "info",
            `Cooldown started for ${formatMs(cooldownSeconds * 1000)} (until ${new Date(safetyState.cooldownUntilMs).toISOString()}).`
          );
          log("Telegram Safety", "STOP", "info", `${hardStopReason}. Stopping campaign to protect account.`);
          break;
        }

        if (failures >= safety.maxFailuresPerRun) {
          hardStopReason = `Reached maxFailuresPerRun (${safety.maxFailuresPerRun})`;
          safetyState.lastStopReason = hardStopReason;
          writeSafetyState(safetyState);
          log("Telegram Safety", "STOP", "info", `${hardStopReason}. Stopping campaign.`);
          break;
        }
      }

      if (hardStopReason) break;

      const isLast = i >= dmTargets.length - 1;
      if (!isLast) {
        await sleep(randomDelayMs(effectiveMinDelay, effectiveMaxDelay));
      }

      if (!isLast && dmsSentThisRun > 0 && dmsSentThisRun % safety.breakEvery === 0) {
        const breakMs = randomDelayMs(safety.breakMinSeconds, safety.breakMaxSeconds);
        log("Telegram Safety", "BREAK", "info", `Cooling down for ${Math.round(breakMs / 1000)}s`);
        await sleep(breakMs);
      }
    }

    if (!hardStopReason) {
      for (const group of safeArray(telegram?.groups)) {
        try {
          const message = nextTgTemplate();
          await client.sendMessage(group, { message });
          log("Telegram Group", String(group), "sent", "Message posted");
        } catch (err) {
          const info = classifyTelegramError(err);
          log("Telegram Group", String(group), "failed", info.raw);
          if (safety.stopOnPeerFlood && (info.isPeerFlood || info.isFloodWait)) {
            hardStopReason = "Flood restriction while posting to groups";
            log("Telegram Safety", "STOP", "info", `${hardStopReason}. Stopping campaign.`);
            break;
          }
        }
        if (hardStopReason) break;
        await sleep(randomDelayMs(effectiveMinDelay, effectiveMaxDelay));
      }
    }

    log(
      "Telegram Safety",
      "SUMMARY",
      hardStopReason ? "failed" : "info",
      `attempts=${attempts}, sent=${dmsSentThisRun}, failures=${failures}, dailySent=${safetyState.daily.sent}/${safety.maxDmPerDay}${hardStopReason ? `, stop=${hardStopReason}` : ""}`
    );
  } finally {
    await client.disconnect();
    log("Telegram", "SESSION", "info", "Disconnected");
  }
}

async function main() {
  const usernamesCount = safeArray(telegram?.usernames).length;
  const groupsCount = safeArray(telegram?.groups).length;
  console.log(`Starting outreach: telegram_usernames=${usernamesCount}, telegram_groups=${groupsCount}`);

  if (usernamesCount > 0 || groupsCount > 0) {
    await runTelegram();
  } else {
    log("Telegram", "RUN", "info", "No Telegram targets provided");
  }

  console.log("Outreach run complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});

