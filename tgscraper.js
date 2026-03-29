/**
 * tgscraper.js - Scrape admins/mods from Telegram groups
 * Uses existing TG session from .tg_session
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && value.value !== undefined) return normalizeId(value.value);
  return value.toString();
}

function isGroupEntity(entity) {
  if (!entity) return false;
  const className = entity.className || "";
  return className === "Chat" || (className === "Channel" && entity.megagroup === true);
}

function parseGroupRef(rawRef) {
  if (!rawRef) return null;

  if (typeof rawRef === "string") {
    const value = rawRef.trim();
    if (!value) return null;

    const linkMatch = value.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^/?&#\s]+)/i);
    if (linkMatch) return { kind: "username", value: linkMatch[1], label: value };

    if (value.startsWith("@")) return { kind: "username", value: value.slice(1), label: value };
    if (value.startsWith("id:")) return { kind: "id", value: value.slice(3), label: value };

    return { kind: "username", value, label: value };
  }

  if (typeof rawRef === "object") {
    if (rawRef.kind === "username" && rawRef.value) {
      return { kind: "username", value: String(rawRef.value), label: rawRef.label || `@${rawRef.value}` };
    }
    if (rawRef.kind === "id" && rawRef.value) {
      return { kind: "id", value: String(rawRef.value), label: rawRef.label || `id:${rawRef.value}` };
    }
    if (rawRef.username) {
      return { kind: "username", value: String(rawRef.username), label: `@${rawRef.username}` };
    }
    if (rawRef.id) {
      return { kind: "id", value: String(rawRef.id), label: `id:${rawRef.id}` };
    }
  }

  return null;
}

function classifyRole(participant) {
  const className = participant?.className || "";
  const customTitle = participant?.rank || null;

  if (className.endsWith("Creator")) {
    return customTitle ? `Owner (${customTitle})` : "Owner";
  }

  if (className.endsWith("Admin")) {
    let role = "Admin";
    const perms = participant.adminRights;
    if (perms) {
      const hasOnlyBasic =
        !perms.deleteMessages &&
        !perms.banUsers &&
        !perms.inviteUsers &&
        !perms.pinMessages &&
        !perms.addAdmins &&
        !perms.anonymous &&
        !perms.manageCall &&
        !perms.other &&
        !perms.manageTopics;
      if (hasOnlyBasic) role = "Moderator";
    }
    return customTitle ? `${role} (${customTitle})` : role;
  }

  return null;
}

function buildAdminEntries(participants, users, groupName, groupLink, onProgress) {
  const entries = [];

  for (const participant of participants) {
    const role = classifyRole(participant);
    if (!role) continue;

    const participantUserId = normalizeId(participant.userId);
    const user = users.find((u) => normalizeId(u.id) === participantUserId);
    if (!user || user.bot) continue;

    const username = user.username ? `@${user.username}` : null;
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";
    const userId = normalizeId(user.id);

    const entry = {
      username: username || `ID:${userId}`,
      displayName,
      role,
      userId,
      group: groupName,
      groupLink,
    };

    entries.push(entry);
    onProgress?.({ type: "found", text: `  - ${username || displayName} - ${role}` });
  }

  return entries;
}

async function getAdminsForEntity(client, entity, groupName, groupLink, onProgress) {
  const { Api } = require("telegram");

  if (entity.className === "Channel") {
    const result = await client.invoke(
      new Api.channels.GetParticipants({
        channel: entity,
        filter: new Api.ChannelParticipantsAdmins(),
        offset: 0,
        limit: 200,
        hash: BigInt(0),
      })
    );

    const participants = result.participants || [];
    const users = result.users || [];
    onProgress?.({ type: "info", text: `Found ${participants.length} admins/mods` });
    return buildAdminEntries(participants, users, groupName, groupLink, onProgress);
  }

  if (entity.className === "Chat") {
    const chatId = parseInt(normalizeId(entity.id), 10);
    const full = await client.invoke(
      new Api.messages.GetFullChat({
        chatId,
      })
    );

    const participants = full.fullChat?.participants?.participants || [];
    const users = full.users || [];
    const adminCandidates = participants.filter((p) => (p.className || "").endsWith("Creator") || (p.className || "").endsWith("Admin"));
    onProgress?.({ type: "info", text: `Found ${adminCandidates.length} admins/mods` });
    return buildAdminEntries(adminCandidates, users, groupName, groupLink, onProgress);
  }

  throw new Error(`Unsupported entity type: ${entity.className || "Unknown"}`);
}

function buildGroupLookup(dialogs) {
  const byId = new Map();
  const byUsername = new Map();

  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!isGroupEntity(entity)) continue;

    const id = normalizeId(entity.id);
    if (id) byId.set(id, entity);

    if (entity.username) {
      byUsername.set(String(entity.username).toLowerCase(), entity);
    }
  }

  return { byId, byUsername };
}

function toUtcDateKey(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeUtcDateInput(value) {
  if (!value) return "";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const key = toUtcDateKey(str);
  return key || "";
}

function unixToIso(unixSeconds) {
  if (unixSeconds === null || unixSeconds === undefined) return null;
  const asNumber = Number(unixSeconds);
  if (!Number.isFinite(asNumber)) return null;
  return new Date(asNumber * 1000).toISOString();
}

async function resolveJoinedAtUtc(client, entity, selfId) {
  const { Api } = require("telegram");

  if (entity.className === "Channel") {
    try {
      const response = await client.invoke(
        new Api.channels.GetParticipant({
          channel: entity,
          participant: new Api.InputPeerSelf(),
        })
      );
      return unixToIso(response?.participant?.date);
    } catch {
      return null;
    }
  }

  if (entity.className === "Chat") {
    try {
      const chatId = parseInt(normalizeId(entity.id), 10);
      const full = await client.invoke(
        new Api.messages.GetFullChat({
          chatId,
        })
      );
      const participants = full.fullChat?.participants?.participants || [];
      const selfParticipant = participants.find((p) => normalizeId(p.userId) === selfId);
      return unixToIso(selfParticipant?.date);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Fetch all groups/supergroups the authenticated user has joined.
 * Returns an array of { name, link, id, participantsCount, isPrivate, ref }
 */
async function fetchJoinedGroups(onProgress, options = {}) {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");
  let dateFromUtc = normalizeUtcDateInput(options.dateFromUtc);
  let dateToUtc = normalizeUtcDateInput(options.dateToUtc);
  if (dateFromUtc && dateToUtc && dateFromUtc > dateToUtc) {
    const tmp = dateFromUtc;
    dateFromUtc = dateToUtc;
    dateToUtc = tmp;
  }
  const hasDateFilter = Boolean(dateFromUtc || dateToUtc);

  const apiId = parseInt(process.env.TG_API_ID, 10);
  const apiHash = process.env.TG_API_HASH;
  const sessionFile = path.join(__dirname, ".tg_session");

  if (!fs.existsSync(sessionFile)) {
    onProgress?.({ type: "error", text: "No Telegram session. Go to Telegram tab and login first." });
    return [];
  }

  const savedSession = fs.readFileSync(sessionFile, "utf-8").trim();
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  try {
    await client.connect();
    onProgress?.({ type: "info", text: "Connected to Telegram - fetching your joined groups..." });
  } catch (err) {
    onProgress?.({ type: "error", text: `Connection failed: ${err.message}` });
    return [];
  }

  const groups = [];
  let skippedOutsideRange = 0;
  let skippedUnknownJoinDate = 0;

  try {
    const dialogs = await client.getDialogs({ limit: 1000 });
    const me = await client.getMe();
    const selfId = normalizeId(me?.id);

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!isGroupEntity(entity)) continue;

      const id = normalizeId(entity.id);
      const username = entity.username ? String(entity.username) : null;
      const link = username ? `https://t.me/${username}` : null;
      const name = entity.title || username || `Group ${id || ""}`.trim();
      const ref = username
        ? { kind: "username", value: username }
        : { kind: "id", value: id };

      if (!ref.value) continue;

      const joinedAtUtc = await resolveJoinedAtUtc(client, entity, selfId);
      const joinedDateKey = joinedAtUtc ? toUtcDateKey(joinedAtUtc) : "";
      const joinedTodayUtc = joinedDateKey ? joinedDateKey === toUtcDateKey(new Date()) : false;

      if (hasDateFilter) {
        if (!joinedDateKey) {
          skippedUnknownJoinDate++;
          continue;
        }
        if ((dateFromUtc && joinedDateKey < dateFromUtc) || (dateToUtc && joinedDateKey > dateToUtc)) {
          skippedOutsideRange++;
          continue;
        }
      }

      groups.push({
        name,
        link,
        id,
        username,
        className: entity.className || null,
        participantsCount: entity.participantsCount || null,
        isPrivate: !username,
        joinedAtUtc,
        joinedTodayUtc,
        ref,
      });

      onProgress?.({
        type: "found",
        text: `  - ${name} - ${link || "(private group, no public link)"}${joinedAtUtc ? ` - joined ${joinedAtUtc}` : ""}`,
      });
    }
  } catch (err) {
    onProgress?.({ type: "error", text: `Failed to fetch dialogs: ${err.message}` });
  }

  await client.disconnect();

  if (hasDateFilter) {
    onProgress?.({
      type: "info",
      text: `Filtered by UTC date: skipped ${skippedOutsideRange} outside range, ${skippedUnknownJoinDate} with unknown join date.`,
    });
  }

  onProgress?.({
    type: "done",
    text: hasDateFilter
      ? `\nDone. Found ${groups.length} groups for UTC range ${dateFromUtc || "Any"} to ${dateToUtc || "Any"}.`
      : `\nDone. Found ${groups.length} joined groups.`,
  });
  return groups;
}

async function scrapeGroupAdmins(groupRefs, onProgress) {
  const { TelegramClient } = require("telegram");
  const { StringSession } = require("telegram/sessions");

  const apiId = parseInt(process.env.TG_API_ID, 10);
  const apiHash = process.env.TG_API_HASH;
  const sessionFile = path.join(__dirname, ".tg_session");

  if (!fs.existsSync(sessionFile)) {
    onProgress?.({ type: "error", text: "No Telegram session. Go to Telegram tab and login first." });
    return [];
  }

  const savedSession = fs.readFileSync(sessionFile, "utf-8").trim();
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  try {
    await client.connect();
    onProgress?.({ type: "info", text: "Connected to Telegram" });
  } catch (err) {
    onProgress?.({ type: "error", text: `Connection failed: ${err.message}` });
    return [];
  }

  const allResults = [];

  let groupLookup = { byId: new Map(), byUsername: new Map() };
  try {
    const dialogs = await client.getDialogs({ limit: 1000 });
    groupLookup = buildGroupLookup(dialogs);
  } catch (err) {
    onProgress?.({ type: "error", text: `Failed to load dialog map: ${err.message}` });
  }

  for (let i = 0; i < groupRefs.length; i++) {
    const parsedRef = parseGroupRef(groupRefs[i]);
    if (!parsedRef) continue;

    onProgress?.({
      type: "info",
      text: `\n[${i + 1}/${groupRefs.length}] Scraping: ${parsedRef.label || `${parsedRef.kind}:${parsedRef.value}`}`,
    });

    try {
      let entity = null;

      if (parsedRef.kind === "id") {
        entity = groupLookup.byId.get(parsedRef.value) || null;
        if (!entity) {
          try {
            entity = await client.getEntity(parsedRef.value);
          } catch {
            // fallback handled below
          }
        }
      } else if (parsedRef.kind === "username") {
        entity = groupLookup.byUsername.get(parsedRef.value.toLowerCase()) || null;
        if (!entity) {
          try {
            entity = await client.getEntity(parsedRef.value);
          } catch {
            // fallback handled below
          }
        }
      }

      if (!entity || !isGroupEntity(entity)) {
        onProgress?.({
          type: "error",
          text: `Cannot resolve group ${parsedRef.kind}:${parsedRef.value}.`,
        });
        continue;
      }

      const groupName = entity.title || entity.username || `${parsedRef.kind}:${parsedRef.value}`;
      const groupLink = entity.username ? `https://t.me/${entity.username}` : null;
      onProgress?.({ type: "info", text: `Group: ${groupName}` });

      try {
        const groupResults = await getAdminsForEntity(client, entity, groupName, groupLink, onProgress);
        allResults.push({
          groupLink,
          groupName,
          members: groupResults,
        });
      } catch (err) {
        onProgress?.({ type: "error", text: `Failed to get admins: ${err.message}` });
      }

      if (i < groupRefs.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (err) {
      onProgress?.({
        type: "error",
        text: `Error while scraping ${parsedRef.kind}:${parsedRef.value}: ${err.message}`,
      });
    }
  }

  await client.disconnect();

  const totalFound = allResults.reduce((sum, group) => sum + group.members.length, 0);
  onProgress?.({ type: "done", text: `\nDone. Found ${totalFound} admins/mods across ${allResults.length} groups.` });

  return allResults;
}

module.exports = { scrapeGroupAdmins, fetchJoinedGroups };
