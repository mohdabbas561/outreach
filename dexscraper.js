require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

function loadHistory() {
  const f = path.join(__dirname, "dex_history.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
}

function saveHistory(entry) {
  const f = path.join(__dirname, "dex_history.json");
  const history = loadHistory();
  history.unshift(entry);
  fs.writeFileSync(f, JSON.stringify(history.slice(0, 50), null, 2));
}

// Load ALL previously scraped TG links across all history
function loadAllScrapedTgLinks() {
  const history = loadHistory();
  const seen = new Set();
  for (const entry of history) {
    for (const r of (entry.results || [])) {
      if (r.tgLink) seen.add(r.tgLink.toLowerCase().trim());
    }
  }
  return seen;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120", "Accept": "application/json" }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Parse error")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractSocials(links = []) {
  let tgLink = null, xLink = null, discordLink = null;

  for (const link of links) {
    const url = (link.url || link.href || link.value || (typeof link === "string" ? link : "")).trim();
    const type = (link.type || link.label || link.platform || "").toLowerCase();

    // Telegram
    if (!tgLink) {
      if (type === "telegram" || type === "tg" || url.includes("t.me/") || url.includes("telegram.me/") || url.includes("telegram.org/")) {
        if (!url.includes("?start=") && !url.includes("/bot") && url.length > 10) {
          tgLink = url.startsWith("http") ? url : `https://${url}`;
        }
      }
    }

    // Twitter / X
    if (!xLink) {
      if (type === "twitter" || type === "x" || url.includes("twitter.com/") || url.includes("x.com/")) {
        if (!url.includes("/status/") && !url.includes("/search")) {
          xLink = url.startsWith("http") ? url : `https://${url}`;
        }
      }
    }

    // Discord
    if (!discordLink) {
      if (type === "discord" || url.includes("discord.gg/") || url.includes("discord.com/invite") || url.includes("discord.io/")) {
        discordLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }
  }

  return { tgLink, xLink, discordLink };
}

async function fetchTokenSocials(tokenAddress, chainId) {
  try {
    const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const pairs = data.pairs || [];
    let tgLink = null, xLink = null, discordLink = null, symbol = "";

    for (const pair of pairs) {
      if (!symbol && pair.baseToken?.symbol) symbol = pair.baseToken.symbol;
      const socials = pair.info?.socials || [];
      const links = pair.info?.links || [];
      const allLinks = [...socials, ...links];
      const extracted = extractSocials(allLinks);
      if (!tgLink && extracted.tgLink) tgLink = extracted.tgLink;
      if (!xLink && extracted.xLink) xLink = extracted.xLink;
      if (!discordLink && extracted.discordLink) discordLink = extracted.discordLink;
      if (tgLink && xLink && discordLink && symbol) break;
    }
    await sleep(150);
    return { tgLink, xLink, discordLink, symbol };
  } catch {
    return { tgLink: null, xLink: null, discordLink: null, symbol: "" };
  }
}

async function scrapeDexScreener(dexUrl, onProgress) {
  const TARGET = 25;
  const MAX_ROUNDS = 6; // keep fetching new batches until we hit TARGET

  // Load all previously scraped TG links to skip duplicates
  const alreadyScraped = loadAllScrapedTgLinks();
  onProgress?.({ type: "info", text: `📚 Loaded ${alreadyScraped.size} previously scraped links to skip` });
  onProgress?.({ type: "info", text: `🎯 Target: ${TARGET} NEW unique tokens with TG links` });

  const results = [];
  const seenThisRun = new Set();
  let skippedDuplicate = 0;
  let round = 0;

  // Search queries — rotate through these to get fresh results each round
  const searchQueries = [
    "solana", "ethereum", "bsc", "meme", "new", "trending",
    "pump", "moon", "degen", "pepe", "shib", "base",
  ];

  async function processTokens(allTokens) {
    for (const token of allTokens) {
      if (results.length >= TARGET) break;

      let rawSymbol = token.symbol || token.ticker || "";
      const rawName = token.description || token.name || "Unknown";
      const links = token.links || [];
      let { tgLink, xLink, discordLink } = extractSocials(links);

      // If no TG from basic links, try fetching token page (also gets symbol)
      if (!tgLink && token.tokenAddress) {
        const fetched = await fetchTokenSocials(token.tokenAddress, token.chainId);
        tgLink = fetched.tgLink;
        if (!xLink) xLink = fetched.xLink;
        if (!discordLink) discordLink = fetched.discordLink;
        if (!rawSymbol && fetched.symbol) rawSymbol = fetched.symbol;
      }

      const name = rawSymbol
        ? `$${rawSymbol.toUpperCase().replace(/^\$/, "").slice(0, 20)}`
        : rawName.slice(0, 30);

      if (!tgLink) continue;
      const tgNorm = tgLink.toLowerCase().trim();

      // Skip already scraped in history
      if (alreadyScraped.has(tgNorm)) {
        skippedDuplicate++;
        if (skippedDuplicate <= 3) onProgress?.({ type: "skip", text: `⏭ Already scraped: ${tgLink}` });
        if (skippedDuplicate === 4) onProgress?.({ type: "skip", text: `⏭ (suppressing further duplicate logs...)` });
        continue;
      }

      // Skip already found in this run
      if (seenThisRun.has(tgNorm)) continue;
      seenThisRun.add(tgNorm);
      alreadyScraped.add(tgNorm); // prevent same from being found in next round

      // Enrich with X/Discord/symbol if missing
      if ((!xLink || !discordLink || !rawSymbol) && token.tokenAddress) {
        const fetched = await fetchTokenSocials(token.tokenAddress, token.chainId);
        if (!xLink && fetched.xLink) xLink = fetched.xLink;
        if (!discordLink && fetched.discordLink) discordLink = fetched.discordLink;
        if (!rawSymbol && fetched.symbol) rawSymbol = fetched.symbol;
      }
      // Rebuild name with enriched symbol
      const finalName = rawSymbol
        ? `$${rawSymbol.toUpperCase().replace(/^\$/, "").slice(0, 20)}`
        : name;

      results.push({
        name: finalName,
        tgLink,
        xLink: xLink || null,
        discordLink: discordLink || null,
        chainId: token.chainId || "solana",
        tokenAddress: token.tokenAddress || "",
      });

      const extras = [xLink ? `X ✓` : `X ✗`, discordLink ? `Discord ✓` : `Discord ✗`].join(" | ");
      onProgress?.({ type: "found", text: `✅ [${results.length}/${TARGET}] ${name} — ${extras}` });
    }
  }

  // Round 1: core endpoints (always fetch fresh)
  round++;
  onProgress?.({ type: "info", text: `\n🔄 Round ${round} — fetching core endpoints...` });
  const coreEndpoints = [
    "https://api.dexscreener.com/token-profiles/latest/v1",
    "https://api.dexscreener.com/token-boosts/latest/v1",
    "https://api.dexscreener.com/token-boosts/top/v1",
  ];
  let coreTokens = [];
  for (const endpoint of coreEndpoints) {
    try {
      const data = await fetchJson(endpoint);
      const tokens = Array.isArray(data) ? data : [];
      coreTokens = coreTokens.concat(tokens);
    } catch {}
  }
  await processTokens(coreTokens);

  // Additional rounds using search queries until we hit TARGET
  let queryIndex = 0;
  while (results.length < TARGET && round < MAX_ROUNDS) {
    round++;
    const q = searchQueries[queryIndex % searchQueries.length];
    queryIndex++;
    onProgress?.({ type: "info", text: `\n🔄 Round ${round} — searching "${q}" (need ${TARGET - results.length} more)...` });

    try {
      const data = await fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
      const roundTokens = [];
      for (const pair of (data.pairs || [])) {
        const socials = pair.info?.socials || [];
        const links = pair.info?.links || [];
        roundTokens.push({
          description: pair.baseToken?.name || pair.baseToken?.symbol || "Unknown",
          symbol: pair.baseToken?.symbol || "",
          chainId: pair.chainId,
          tokenAddress: pair.baseToken?.address,
          links: [...socials, ...links],
        });
      }
      onProgress?.({ type: "info", text: `   Got ${roundTokens.length} tokens from search` });
      await processTokens(roundTokens);
    } catch (err) {
      onProgress?.({ type: "skip", text: `   Search failed: ${err.message}` });
    }

    await sleep(300); // small pause between rounds
  }

  if (results.length < TARGET) {
    onProgress?.({ type: "info", text: `⚠️ Only found ${results.length} new unique tokens after ${round} rounds (API may not have more fresh tokens right now)` });
  }

  const summary = `📊 ${results.length} new TG | ${results.filter(r=>r.xLink).length} X | ${results.filter(r=>r.discordLink).length} Discord | ${skippedDuplicate} already-scraped skipped`;
  onProgress?.({ type: "info", text: `\n${summary}` });

  // Save results
  fs.writeFileSync(path.join(__dirname, "dex_results.json"), JSON.stringify(results, null, 2));

  const entry = {
    id: Date.now(),
    scrapedAt: new Date().toISOString(),
    url: dexUrl,
    count: results.length,
    withX: results.filter(r => r.xLink).length,
    withDiscord: results.filter(r => r.discordLink).length,
    results,
  };
  saveHistory(entry);

  onProgress?.({ type: "done", text: `🎉 Done! ${results.length} new tokens found.` });
  return { results, historyEntry: entry };
}

module.exports = { scrapeDexScreener, loadHistory };