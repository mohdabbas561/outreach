require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const HISTORY_FILE = path.join(__dirname, "dex_history.json");
const RESULTS_FILE = path.join(__dirname, "dex_results.json");
const SEEN_FILE = path.join(__dirname, "dex_seen.json");

const TARGET_COUNT = 10;
const MAX_EXTRA_ROUNDS = 8;

const CORE_ENDPOINTS = [
  "https://api.dexscreener.com/token-profiles/latest/v1",
  "https://api.dexscreener.com/token-boosts/latest/v1",
  "https://api.dexscreener.com/token-boosts/top/v1",
];

const DEFAULT_QUERIES = [
  "meme",
  "solana",
  "ethereum",
  "base",
  "trending",
  "new",
  "degen",
  "pepe",
  "shib",
];

const CHAIN_ALIASES = {
  sol: "solana",
  solana: "solana",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "bsc",
  bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  polygon: "polygon",
  matic: "polygon",
  avalanche: "avalanche",
  avax: "avalanche",
  sui: "sui",
  tron: "tron",
  ton: "ton",
  aptos: "aptos",
};

function normalizeChainId(value) {
  if (!value) return "";
  const raw = String(value).toLowerCase().trim();
  return CHAIN_ALIASES[raw] || raw;
}

function normalizeTgLink(value) {
  if (!value) return "";
  let normalized = String(value).trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^www\./, "");
  normalized = normalized.replace(/\/+$/, "");
  return normalized;
}

function safeReadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadHistory() {
  return safeReadJsonArray(HISTORY_FILE);
}

function saveHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 100), null, 2));
}

function buildDexKey({ chainId, tokenAddress, tgLink }) {
  const normalizedChain = normalizeChainId(chainId) || "unknown";
  if (tokenAddress) return `${normalizedChain}:${String(tokenAddress).toLowerCase().trim()}`;
  if (tgLink) return `tg:${normalizeTgLink(tgLink)}`;
  return null;
}

function bootstrapSeenFromHistory() {
  const seen = new Set();
  for (const entry of loadHistory()) {
    for (const result of entry.results || []) {
      const key = buildDexKey(result);
      if (key) seen.add(key);
    }
  }
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen], null, 2));
  return seen;
}

function loadSeenDexKeys() {
  if (!fs.existsSync(SEEN_FILE)) {
    return bootstrapSeenFromHistory();
  }
  const arr = safeReadJsonArray(SEEN_FILE).map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  return new Set(arr);
}

function saveSeenDexKeys(seenSet) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenSet], null, 2));
}

function clearDexSeenMemory() {
  fs.writeFileSync(SEEN_FILE, "[]");
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/120",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Parse error"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(array) {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function extractSocials(links = []) {
  let tgLink = null;
  let xLink = null;
  let discordLink = null;

  for (const link of links) {
    const url = (link?.url || link?.href || link?.value || (typeof link === "string" ? link : "")).trim();
    if (!url) continue;

    const type = (link?.type || link?.label || link?.platform || "").toLowerCase();

    if (!tgLink) {
      const isTg =
        type === "telegram" ||
        type === "tg" ||
        url.includes("t.me/") ||
        url.includes("telegram.me/") ||
        url.includes("telegram.org/");
      if (isTg && !url.includes("?start=") && !url.includes("/bot")) {
        tgLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }

    if (!xLink) {
      const isX = type === "twitter" || type === "x" || url.includes("twitter.com/") || url.includes("x.com/");
      if (isX && !url.includes("/status/") && !url.includes("/search")) {
        xLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }

    if (!discordLink) {
      const isDiscord =
        type === "discord" ||
        url.includes("discord.gg/") ||
        url.includes("discord.com/invite") ||
        url.includes("discord.io/");
      if (isDiscord) {
        discordLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }
  }

  return { tgLink, xLink, discordLink };
}

async function fetchTokenSocials(tokenAddress) {
  try {
    const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const pairs = data.pairs || [];
    let tgLink = null;
    let xLink = null;
    let discordLink = null;
    let symbol = "";
    let chainId = "";

    for (const pair of pairs) {
      if (!symbol && pair?.baseToken?.symbol) symbol = pair.baseToken.symbol;
      if (!chainId && pair?.chainId) chainId = normalizeChainId(pair.chainId);

      const socials = pair?.info?.socials || [];
      const links = pair?.info?.links || [];
      const extracted = extractSocials([...socials, ...links]);

      if (!tgLink && extracted.tgLink) tgLink = extracted.tgLink;
      if (!xLink && extracted.xLink) xLink = extracted.xLink;
      if (!discordLink && extracted.discordLink) discordLink = extracted.discordLink;

      if (tgLink && xLink && discordLink && symbol) break;
    }

    await sleep(120);
    return { tgLink, xLink, discordLink, symbol, chainId };
  } catch {
    return { tgLink: null, xLink: null, discordLink: null, symbol: "", chainId: "" };
  }
}

function parseDexInput(dexUrl) {
  const source = {
    chainFilter: null,
    searchQueries: [],
    modeLabel: "mixed",
  };

  const addQuery = (query) => {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return;
    if (!source.searchQueries.includes(normalized)) source.searchQueries.push(normalized);
  };

  try {
    const url = new URL(dexUrl);
    const pathParts = url.pathname.split("/").filter(Boolean).map((p) => p.toLowerCase());
    const firstPathPart = pathParts[0] || "";
    const pathChain = normalizeChainId(firstPathPart);
    const queryChain = normalizeChainId(url.searchParams.get("chain"));

    if (pathChain && CHAIN_ALIASES[firstPathPart]) source.chainFilter = pathChain;
    if (!source.chainFilter && queryChain) source.chainFilter = queryChain;

    if (source.chainFilter) {
      source.modeLabel = `${source.chainFilter}-only`;
      addQuery(source.chainFilter);
    }

    const rawQuery =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("search") ||
      "";
    rawQuery
      .split(/[,\s]+/)
      .map((q) => q.trim())
      .filter(Boolean)
      .forEach(addQuery);
  } catch {
    dexUrl
      .split(/[,\s]+/)
      .map((q) => q.trim())
      .filter(Boolean)
      .forEach(addQuery);
  }

  for (const query of DEFAULT_QUERIES) addQuery(query);
  return source;
}

async function fetchCoreCandidates() {
  const all = [];
  for (const endpoint of CORE_ENDPOINTS) {
    try {
      const data = await fetchJson(endpoint);
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        all.push({
          name: row?.description || row?.name || row?.symbol || "Unknown",
          symbol: row?.symbol || "",
          chainId: normalizeChainId(row?.chainId || row?.chain),
          tokenAddress: row?.tokenAddress || row?.address || row?.token?.address || "",
          links: row?.links || [],
        });
      }
    } catch {
      // Keep running even if one endpoint fails.
    }
  }
  return all;
}

async function fetchSearchCandidates(query) {
  const data = await fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
  const pairs = data.pairs || [];
  const tokens = [];
  for (const pair of pairs) {
    tokens.push({
      name: pair?.baseToken?.name || pair?.baseToken?.symbol || "Unknown",
      symbol: pair?.baseToken?.symbol || "",
      chainId: normalizeChainId(pair?.chainId),
      tokenAddress: pair?.baseToken?.address || "",
      links: [...(pair?.info?.socials || []), ...(pair?.info?.links || [])],
    });
  }
  return tokens;
}

async function scrapeDexScreener(dexUrl, onProgress) {
  const source = parseDexInput(dexUrl);
  const seenGlobal = loadSeenDexKeys();
  const seenRun = new Set();
  const socialsCache = new Map();
  const results = [];

  let skippedKnown = 0;
  let skippedNoTg = 0;
  let skippedByChain = 0;
  let rounds = 0;

  onProgress?.({
    type: "info",
    text: `Mode: ${source.modeLabel}. Target: ${TARGET_COUNT} unique random tokens.`,
  });
  onProgress?.({
    type: "info",
    text: `Loaded ${seenGlobal.size} previously scraped tokens (persistent memory).`,
  });

  async function enrichCandidate(candidate) {
    const base = {
      name: candidate.name || "Unknown",
      symbol: candidate.symbol || "",
      chainId: normalizeChainId(candidate.chainId),
      tokenAddress: candidate.tokenAddress || "",
      ...extractSocials(candidate.links || []),
    };

    if ((!base.tgLink || !base.xLink || !base.discordLink || !base.symbol || !base.chainId) && base.tokenAddress) {
      let cached = socialsCache.get(base.tokenAddress);
      if (!cached) {
        cached = await fetchTokenSocials(base.tokenAddress);
        socialsCache.set(base.tokenAddress, cached);
      }
      if (!base.tgLink) base.tgLink = cached.tgLink;
      if (!base.xLink) base.xLink = cached.xLink;
      if (!base.discordLink) base.discordLink = cached.discordLink;
      if (!base.symbol) base.symbol = cached.symbol;
      if (!base.chainId) base.chainId = normalizeChainId(cached.chainId);
    }

    return base;
  }

  async function processPool(pool, label) {
    const shuffled = shuffle(pool);
    onProgress?.({ type: "info", text: `Checking ${shuffled.length} candidates from ${label}...` });

    for (const candidate of shuffled) {
      if (results.length >= TARGET_COUNT) break;

      const enriched = await enrichCandidate(candidate);
      const chainId = normalizeChainId(enriched.chainId || candidate.chainId);

      if (source.chainFilter && chainId !== source.chainFilter) {
        skippedByChain++;
        continue;
      }

      if (!enriched.tgLink) {
        skippedNoTg++;
        continue;
      }

      const key = buildDexKey({
        chainId,
        tokenAddress: enriched.tokenAddress || candidate.tokenAddress,
        tgLink: enriched.tgLink,
      });
      if (!key) continue;

      if (seenGlobal.has(key)) {
        skippedKnown++;
        continue;
      }

      if (seenRun.has(key)) continue;
      seenRun.add(key);

      const symbol = enriched.symbol
        ? `$${String(enriched.symbol).toUpperCase().replace(/^\$/, "").slice(0, 20)}`
        : String(candidate.name || "Unknown").slice(0, 30);

      const row = {
        name: symbol,
        tgLink: enriched.tgLink,
        xLink: enriched.xLink || null,
        discordLink: enriched.discordLink || null,
        chainId: chainId || "unknown",
        tokenAddress: enriched.tokenAddress || candidate.tokenAddress || "",
      };

      results.push(row);
      seenGlobal.add(key);
      onProgress?.({
        type: "found",
        text: `✅ [${results.length}/${TARGET_COUNT}] ${row.name} (${row.chainId})`,
      });
    }
  }

  rounds++;
  const corePool = await fetchCoreCandidates();
  await processPool(corePool, "core endpoints");

  for (const query of source.searchQueries.slice(0, 6)) {
    if (results.length >= TARGET_COUNT) break;
    rounds++;
    try {
      const pool = await fetchSearchCandidates(query);
      await processPool(pool, `search "${query}"`);
    } catch (err) {
      onProgress?.({ type: "skip", text: `Search "${query}" failed: ${err.message}` });
    }
    await sleep(250);
  }

  let extraRound = 0;
  while (results.length < TARGET_COUNT && extraRound < MAX_EXTRA_ROUNDS) {
    extraRound++;
    rounds++;
    const query = DEFAULT_QUERIES[Math.floor(Math.random() * DEFAULT_QUERIES.length)];
    try {
      const pool = await fetchSearchCandidates(query);
      await processPool(pool, `extra search "${query}"`);
    } catch (err) {
      onProgress?.({ type: "skip", text: `Extra search failed: ${err.message}` });
    }
    await sleep(250);
  }

  saveSeenDexKeys(seenGlobal);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  const entry = {
    id: Date.now(),
    scrapedAt: new Date().toISOString(),
    url: dexUrl,
    count: results.length,
    withX: results.filter((r) => r.xLink).length,
    withDiscord: results.filter((r) => r.discordLink).length,
    mode: source.modeLabel,
    rounds,
    results,
  };
  saveHistory(entry);

  onProgress?.({
    type: "info",
    text: `Summary: ${results.length} found | ${skippedKnown} already seen | ${skippedNoTg} no TG | ${skippedByChain} chain filtered.`,
  });
  onProgress?.({ type: "done", text: `🎉 Done! ${results.length} unique random tokens ready.` });

  return { results, historyEntry: entry };
}

module.exports = {
  scrapeDexScreener,
  loadHistory,
  clearDexSeenMemory,
};
