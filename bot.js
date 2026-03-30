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
  appendLog({ time, platform, target, status, message });
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
    maxFailuresPerRun: Math.max(1, toInt(campaignSafety.maxFailuresPerRun, toInt(process.env.TG_MAX_FAILURES_PER_RUN, 4))),
    minDelaySeconds: Math.max(45, toInt(campaignSafety.minDelaySeconds, toInt(process.env.TG_SAFE_MIN_DELAY_SECONDS, 90))),
    maxDelaySeconds: Math.max(60, toInt(campaignSafety.maxDelaySeconds, toInt(process.env.TG_SAFE_MAX_DELAY_SECONDS, 180))),
    breakEvery: Math.max(1, toInt(campaignSafety.breakEvery, toInt(process.env.TG_BREAK_EVERY, 4))),
    breakMinSeconds: Math.max(30, toInt(campaignSafety.breakMinSeconds, toInt(process.env.TG_BREAK_MIN_SECONDS, 180))),
    breakMaxSeconds: Math.max(45, toInt(campaignSafety.breakMaxSeconds, toInt(process.env.TG_BREAK_MAX_SECONDS, 420))),
  };
  if (cfg.maxDelaySeconds < cfg.minDelaySeconds) cfg.maxDelaySeconds = cfg.minDelaySeconds;
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
const safety = buildSafetyConfig(campaign?.safety || {});

let templateIndex = 0;
function nextTgTemplate() {
  const fallback = [
    `Hey [NAME]
We are a gaming provider and we have built games tailored for Meme Tokens and GambleFi users. We see a strong fit with [TOKEN NAME], and we believe your holders would love seeing your token actively used inside our games.

We would love to explore a partnership and discuss how we can integrate your token into our games. If this interests you, lets connect and walk you through the full offering.

Looking forward to hearing from you!`,
  ];
  const list = tgTemplateList.length ? [String(tgTemplateList[0])] : fallback;
  const message = list[templateIndex % list.length];
  templateIndex++;
  return message;
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

  const configuredMin = Math.max(toInt(telegram?.delaySeconds, 60), safety.minDelaySeconds);
  const configuredMax = Math.max(toInt(telegram?.delaySecondsMax, 90), safety.maxDelaySeconds, configuredMin);

  log(
    "Telegram Safety",
    "CONFIG",
    "info",
    `maxDmPerRun=${safety.maxDmPerRun}, maxFailuresPerRun=${safety.maxFailuresPerRun}, delay=${configuredMin}-${configuredMax}s, breakEvery=${safety.breakEvery}, break=${safety.breakMinSeconds}-${safety.breakMaxSeconds}s`
  );

  let hardStopReason = "";
  let failures = 0;
  let dmsSentThisRun = 0;
  let attempts = 0;

  try {
    const uniqueTargets = buildDmTargets(telegram);
    const previouslyMessaged = safety.skipPreviouslyMessaged ? getPreviouslyMessagedSet() : new Set();
    const filteredForFresh = uniqueTargets.filter((t) => !previouslyMessaged.has(normalizeUsername(t.username)));
    const dmTargets = filteredForFresh.slice(0, safety.maxDmPerRun);
    const skippedByHistory = uniqueTargets.length - filteredForFresh.length;
    const skippedByCap = filteredForFresh.length - dmTargets.length;

    if (skippedByHistory > 0) {
      log("Telegram Safety", "FILTER", "info", `Skipped ${skippedByHistory} usernames already messaged earlier`);
    }
    if (skippedByCap > 0) {
      log("Telegram Safety", "FILTER", "info", `Skipped ${skippedByCap} usernames due to maxDmPerRun cap`);
    }

    for (let i = 0; i < dmTargets.length; i++) {
      const target = dmTargets[i];
      const username = target.username;
      attempts++;
      try {
        const message = renderDmMessage(nextTgTemplate(), target);
        await client.sendMessage(username, { message });
        dmsSentThisRun++;
        log("Telegram DM", username, "sent", message.slice(0, 80));
      } catch (err) {
        failures++;
        const info = classifyTelegramError(err);
        log("Telegram DM", username, "failed", info.raw);

        if (safety.stopOnPeerFlood && (info.isPeerFlood || info.isFloodWait)) {
          hardStopReason = info.isPeerFlood
            ? "PEER_FLOOD detected by Telegram"
            : `FLOOD_WAIT detected (${info.floodWaitSeconds || "unknown"}s)`;
          log("Telegram Safety", "STOP", "info", `${hardStopReason}. Stopping campaign to protect account.`);
          break;
        }

        if (failures >= safety.maxFailuresPerRun) {
          hardStopReason = `Reached maxFailuresPerRun (${safety.maxFailuresPerRun})`;
          log("Telegram Safety", "STOP", "info", `${hardStopReason}. Stopping campaign.`);
          break;
        }
      }

      if (hardStopReason) break;

      const isLast = i >= dmTargets.length - 1;
      if (!isLast) {
        await sleep(randomDelayMs(configuredMin, configuredMax));
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
        await sleep(randomDelayMs(configuredMin, configuredMax));
      }
    }

    log(
      "Telegram Safety",
      "SUMMARY",
      hardStopReason ? "failed" : "info",
      `attempts=${attempts}, sent=${dmsSentThisRun}, failures=${failures}${hardStopReason ? `, stop=${hardStopReason}` : ""}`
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

