/**
 * ⚡ OUTREACH BOT - bot.js
 * Reads campaign.json exported from the React dashboard
 * Runs Telegram + X outreach automation
 *
 * SETUP:
 *   1. npm install telegram input dotenv
 *
 *   3. Create .env file with your credentials (see below)
 *   4. Export campaign.json from the React dashboard
 *   5. node bot.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const input = require("input");

// Suppress noisy Telegram library TIMEOUT background errors
process.on("unhandledRejection", (reason) => {
  if (reason?.message === "TIMEOUT" || String(reason).includes("TIMEOUT")) return;
  console.error("Unhandled rejection:", reason);
});

// ─── Load Campaign Config ────────────────────────────────────────────────────
const configPath = path.join(__dirname, "campaign.json");
if (!fs.existsSync(configPath)) {
  console.error("❌  campaign.json not found. Export it from the React dashboard first.");
  process.exit(1);
}
const campaign = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const { telegram, tgTemplates } = campaign;
const tgTemplateList = tgTemplates || xTemplates || [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
let _tgTemplateIndex = 0;
function nextTgTemplate() {
  const list = tgTemplateList.length ? tgTemplateList : ["Hey! Luci from Moonshot Win here. Let me know if you are interested."];
  const t = list[_tgTemplateIndex % list.length];
  _tgTemplateIndex++;
  return t;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSeconds, maxSeconds) {
  const min = (minSeconds || 60) * 1000;
  const max = (maxSeconds || minSeconds + 30 || 90) * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(platform, target, status, message = "") {
  const time = new Date().toLocaleTimeString();
  const statusIcon = { sent: "✅", failed: "❌", positive: "🎉", info: "ℹ️" }[status] || "•";
  console.log(`[${time}] ${statusIcon} [${platform}] ${target} — ${message}`);

  // Append to logs.json for dashboard to read
  const logsPath = path.join(__dirname, "logs.json");
  const logs = fs.existsSync(logsPath) ? JSON.parse(fs.readFileSync(logsPath)) : [];
  logs.push({ time, platform, target, status, message });
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

// ─── TELEGRAM ────────────────────────────────────────────────────────────────
async function runTelegram() {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");

  const apiId = parseInt(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;

  if (!apiId || !apiHash) {
    console.warn("⚠️  TG_API_ID or TG_API_HASH missing in .env — skipping Telegram");
    return;
  }

  // Load or create session
  const sessionFile = path.join(__dirname, ".tg_session");
  const savedSession = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf-8").trim() : "";
  const stringSession = new StringSession(savedSession);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => process.env.TG_PHONE || await input.text("Telegram phone number: "),
    password: async () => await input.text("2FA password (if enabled, else press Enter): "),
    phoneCode: async () => await input.text("Enter the code you received: "),
    onError: (err) => console.error("TG Error:", err),
  });

  // Save session for next run
  fs.writeFileSync(sessionFile, client.session.save());
  log("Telegram", "AUTH", "info", "Logged in and session saved ✅");

  // ── DM Usernames ──
  for (const username of telegram.usernames) {
    try {
      const message = nextTgTemplate();
      await client.sendMessage(username, { message });
      log("Telegram DM", username, "sent", message.slice(0, 60) + "...");
    } catch (err) {
      log("Telegram DM", username, "failed", err.message);
    }
    await sleep(randomDelay(telegram.delaySeconds, telegram.delaySecondsMax));
  }

  // ── Post in Groups ──
  for (const group of telegram.groups) {
    try {
      const message = nextTgTemplate();
      await client.sendMessage(group, { message });
      log("Telegram Group", group, "sent", "Partnership pitch posted");
    } catch (err) {
      log("Telegram Group", group, "failed", err.message);
    }
    await sleep(randomDelay(telegram.delaySeconds, telegram.delaySecondsMax));
  }

  await client.disconnect();
  log("Telegram", "SESSION", "info", "Telegram complete. Disconnected.");
}

// ─── X / TWITTER ─────────────────────────────────────────────────────────────
// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`
  ⚡ OUTREACH BOT STARTING
  ─────────────────────────────
  📱 Telegram DMs:    ${telegram.usernames.length}
  👥 Telegram Groups: ${telegram.groups.length}
  📝 TG Templates:    ${tgTemplateList.length}
  ─────────────────────────────
  `);

  // Run Telegram
  if (telegram.usernames.length > 0 || telegram.groups.length > 0) {
    console.log("\n📱 Starting Telegram outreach...\n");
    await runTelegram();
  }

  console.log("\n✅ All outreach complete! Check logs.json for full report.\n");
}

main().catch(console.error);