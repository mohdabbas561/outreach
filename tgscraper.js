/**
 * tgscraper.js — Scrape admins/mods from Telegram groups
 * Uses existing TG session from .tg_session
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

/**
 * Fetch all groups/supergroups the authenticated user has joined.
 * Returns an array of { name, link, id, participantsCount }
 */
async function fetchJoinedGroups(onProgress) {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");

  const apiId = parseInt(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const sessionFile = path.join(__dirname, ".tg_session");

  if (!fs.existsSync(sessionFile)) {
    onProgress?.({ type: "error", text: "❌ No Telegram session. Go to Telegram tab and login first." });
    return [];
  }

  const savedSession = fs.readFileSync(sessionFile, "utf-8").trim();
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  try {
    await client.connect();
    onProgress?.({ type: "info", text: "✅ Connected to Telegram — fetching your joined groups..." });
  } catch (err) {
    onProgress?.({ type: "error", text: `❌ Connection failed: ${err.message}` });
    return [];
  }

  const groups = [];

  try {
    // GetDialogs fetches all conversations including groups/channels
    const dialogs = await client.getDialogs({ limit: 500 });

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity) continue;

      const className = entity.className || "";
      // Only include groups and supergroups (megagroups), skip channels/broadcasts and private chats
      const isGroup = className === "Chat" || (className === "Channel" && entity.megagroup === true);
      if (!isGroup) continue;

      // Build t.me link
      let link = null;
      if (entity.username) {
        link = `https://t.me/${entity.username}`;
      } else {
        // Private group — no public link, skip (can't scrape without invite link)
        continue;
      }

      groups.push({
        name: entity.title || entity.username,
        link,
        id: entity.id?.toString(),
        participantsCount: entity.participantsCount || null,
      });

      onProgress?.({ type: "found", text: `  ✅ ${entity.title || entity.username} — ${link}` });
    }
  } catch (err) {
    onProgress?.({ type: "error", text: `❌ Failed to fetch dialogs: ${err.message}` });
  }

  await client.disconnect();

  onProgress?.({ type: "done", text: `\n🎉 Found ${groups.length} joined public groups.` });
  return groups;
}

async function scrapeGroupAdmins(groupLinks, onProgress) {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");
  const { Api } = require("telegram");
  const GetParticipantsRequest = Api.channels.GetParticipants;
  const ChannelParticipantsAdmins = Api.ChannelParticipantsAdmins;

  const apiId = parseInt(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;
  const sessionFile = path.join(__dirname, ".tg_session");

  if (!fs.existsSync(sessionFile)) {
    onProgress?.({ type: "error", text: "❌ No Telegram session. Go to Telegram tab and login first." });
    return [];
  }

  const savedSession = fs.readFileSync(sessionFile, "utf-8").trim();
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  try {
    await client.connect();
    onProgress?.({ type: "info", text: "✅ Connected to Telegram" });
  } catch (err) {
    onProgress?.({ type: "error", text: `❌ Connection failed: ${err.message}` });
    return [];
  }

  const allResults = [];

  for (let i = 0; i < groupLinks.length; i++) {
    const groupLink = groupLinks[i].trim();
    if (!groupLink) continue;

    onProgress?.({ type: "info", text: `\n🔍 [${i+1}/${groupLinks.length}] Scraping: ${groupLink}` });

    try {
      // Extract username from link
      const match = groupLink.match(/(?:t\.me|telegram\.me)\/([^/?&#\s]+)/i);
      if (!match) {
        onProgress?.({ type: "skip", text: `⚠️ Cannot parse link: ${groupLink}` });
        continue;
      }
      const username = match[1];

      // Get the entity
      let entity;
      try {
        entity = await client.getEntity(username);
      } catch (err) {
        onProgress?.({ type: "error", text: `❌ Cannot access @${username}: ${err.message}` });
        continue;
      }

      const groupName = entity.title || entity.username || username;
      onProgress?.({ type: "info", text: `📋 Group: ${groupName}` });

      // Fetch admins
      let admins = [];
      try {
        const result = await client.invoke(
          new GetParticipantsRequest({
            channel: entity,
            filter: new ChannelParticipantsAdmins(),
            offset: 0,
            limit: 200,
            hash: BigInt(0),
          })
        );
        admins = result.participants || [];
        const users = result.users || [];

        onProgress?.({ type: "info", text: `👥 Found ${admins.length} admins/mods` });

        const groupResults = [];

        for (const admin of admins) {
          // Find matching user object
          const user = users.find(u => u.id?.toString() === admin.userId?.toString() || u.id === admin.userId);
          if (!user) continue;

          // Skip bots
          if (user.bot) continue;

          const uname = user.username ? `@${user.username}` : null;
          const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";
          const userId = user.id?.toString();

          // Determine role
          let role = "Admin";
          let customTitle = null;

          if (admin.className === "ChannelParticipantCreator") {
            role = "Owner";
            customTitle = admin.rank || null;
          } else if (admin.className === "ChannelParticipantAdmin") {
            role = "Admin";
            customTitle = admin.rank || null;
            // Check specific permissions to determine if mod
            const perms = admin.adminRights;
            if (perms) {
              const hasOnlyBasic = !perms.deleteMessages && !perms.banUsers && !perms.inviteUsers && !perms.pinMessages && !perms.addAdmins && !perms.anonymous && !perms.manageCall && !perms.other && !perms.manageTopics;
              if (hasOnlyBasic) role = "Moderator";
            }
          }

          const finalRole = customTitle ? `${role} (${customTitle})` : role;

          const entry = {
            username: uname || `ID:${userId}`,
            displayName,
            role: finalRole,
            userId,
            group: groupName,
            groupLink,
          };

          groupResults.push(entry);

          const logName = uname || displayName;
          onProgress?.({ type: "found", text: `  ✅ ${logName} — ${finalRole}` });
        }

        allResults.push({
          groupLink,
          groupName,
          members: groupResults,
        });

      } catch (err) {
        onProgress?.({ type: "error", text: `❌ Failed to get admins: ${err.message}` });
      }

      // Small delay between groups
      if (i < groupLinks.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }

    } catch (err) {
      onProgress?.({ type: "error", text: `❌ Error on ${groupLink}: ${err.message}` });
    }
  }

  await client.disconnect();

  const totalFound = allResults.reduce((sum, g) => sum + g.members.length, 0);
  onProgress?.({ type: "done", text: `\n🎉 Done! Found ${totalFound} admins/mods across ${allResults.length} groups.` });

  return allResults;
}

module.exports = { scrapeGroupAdmins, fetchJoinedGroups };