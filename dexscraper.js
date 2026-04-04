require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const HISTORY_FILE = path.join(__dirname, "dex_history.json");
const RESULTS_FILE = path.join(__dirname, "dex_results.json");
const SEEN_FILE = path.join(__dirname, "dex_seen.json");

const TARGET_COUNT = 10;

// ─── File helpers ─────────────────────────────────────────────────────────────

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

function loadSeenDexKeys() {
  const arr = safeReadJsonArray(SEEN_FILE)
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  return new Set(arr);
}

function saveSeenDexKeys(seenSet) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenSet], null, 2));
}

function clearDexSeenMemory() {
  fs.writeFileSync(SEEN_FILE, "[]");
}

// ─── Social helpers ───────────────────────────────────────────────────────────

const CHAIN_ALIASES = {
  sol: "solana", solana: "solana",
  eth: "ethereum", ethereum: "ethereum",
  bnb: "bsc", bsc: "bsc",
  base: "base",
  arbitrum: "arbitrum", arb: "arbitrum",
  polygon: "polygon", matic: "polygon",
  avalanche: "avalanche", avax: "avalanche",
  sui: "sui", tron: "tron", ton: "ton", aptos: "aptos",
};

function normalizeChainId(value) {
  if (!value) return "";
  const raw = String(value).toLowerCase().trim();
  return CHAIN_ALIASES[raw] || raw;
}

function normalizeTgLink(value) {
  if (!value) return "";
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return s;
}

function extractSocials(links = []) {
  let tgLink = null, xLink = null, discordLink = null;
  for (const link of links) {
    const url = (
      link?.url || link?.href || link?.value ||
      (typeof link === "string" ? link : "")
    ).trim();
    if (!url) continue;
    const type = (link?.type || link?.label || link?.platform || "").toLowerCase();

    if (!tgLink) {
      const isTg =
        type === "telegram" || type === "tg" ||
        url.includes("t.me/") || url.includes("telegram.me/");
      if (isTg && !url.includes("?start=") && !url.includes("/bot")) {
        tgLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }
    if (!xLink) {
      const isX = type === "twitter" || type === "x" ||
        url.includes("twitter.com/") || url.includes("x.com/");
      if (isX && !url.includes("/status/") && !url.includes("/search")) {
        xLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }
    if (!discordLink) {
      const isDiscord = type === "discord" ||
        url.includes("discord.gg/") || url.includes("discord.com/invite");
      if (isDiscord) {
        discordLink = url.startsWith("http") ? url : `https://${url}`;
      }
    }
  }
  return { tgLink, xLink, discordLink };
}

// ─── Fetch socials from DexScreener token API ─────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0 Chrome/120", Accept: "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Parse error")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function fetchTokenSocials(tokenAddress) {
  try {
    const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const pairs = data.pairs || [];
    let tgLink = null, xLink = null, discordLink = null, symbol = "", chainId = "";
    for (const pair of pairs) {
      if (!symbol && pair?.baseToken?.symbol) symbol = pair.baseToken.symbol;
      if (!chainId && pair?.chainId) chainId = normalizeChainId(pair.chainId);
      const socials = [...(pair?.info?.socials || []), ...(pair?.info?.links || [])];
      const extracted = extractSocials(socials);
      if (!tgLink && extracted.tgLink) tgLink = extracted.tgLink;
      if (!xLink && extracted.xLink) xLink = extracted.xLink;
      if (!discordLink && extracted.discordLink) discordLink = extracted.discordLink;
      if (tgLink && xLink && symbol) break;
    }
    await sleep(120);
    return { tgLink, xLink, discordLink, symbol, chainId };
  } catch {
    return { tgLink: null, xLink: null, discordLink: null, symbol: "", chainId: "" };
  }
}

// ─── Playwright scraper — reads EXACTLY what your filter URL shows ────────────

/**
 * Launches a real browser, loads your DexScreener filter URL,
 * waits for the token rows to render, then extracts token addresses
 * from whatever is visible — exactly matching what you see in the browser.
 */
async function scrapeTokensFromPage(dexUrl, targetCount, onProgress) {
  onProgress?.({ type: "info", text: "Launching browser to load your filtered URL..." });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Intercept and block heavy assets we don't need (images, fonts, media)
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font"].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    onProgress?.({ type: "info", text: `Opening: ${dexUrl}` });
    await page.goto(dexUrl, { waitUntil: "networkidle", timeout: 45000 });

    // Wait for token rows to appear — DexScreener renders a table/list of pairs
    onProgress?.({ type: "info", text: "Waiting for token rows to render..." });

    // Try multiple selectors that DexScreener uses for rows
    const rowSelectors = [
      "a[href*='/solana/']",
      "a[href*='/ethereum/']",
      "a[href*='/bsc/']",
      "a[href*='/base/']",
      "a[href*='/arbitrum/']",
      "a[href*='/polygon/']",
      "a[href*='/avalanche/']",
      "a[href*='/sui/']",
      "a[href*='/tron/']",
      "a[href*='/ton/']",
      // Generic pair link pattern
      "a[href^='/'][href*='0x']",
      "a[href^='/'][href*='pump']",
    ];

    // Wait up to 15s for any token link to appear
    try {
      await page.waitForSelector(rowSelectors.join(", "), { timeout: 15000 });
    } catch {
      onProgress?.({ type: "info", text: "Standard selectors not found, trying scroll trigger..." });
    }

    // Scroll down to load more rows (virtual lists need this)
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await sleep(1500);

    // Extract all href links that look like DexScreener pair pages
    // Format: /<chain>/<pairAddress>  e.g. /solana/ABC123...
    const pairLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const results = [];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        // Match /<chain>/<address> pattern — address is long alphanumeric
        const match = href.match(/^\/([a-z]+)\/([a-zA-Z0-9]{20,})/);
        if (match) {
          results.push({ chain: match[1], pairAddress: match[2], href });
        }
      }
      // Deduplicate by pairAddress
      const seen = new Set();
      return results.filter((r) => {
        if (seen.has(r.pairAddress)) return false;
        seen.add(r.pairAddress);
        return true;
      });
    });

    onProgress?.({
      type: "info",
      text: `Found ${pairLinks.length} token pair links on page.`,
    });

    // Now resolve each pair link to get baseToken address via DexScreener API
    const tokens = [];
    for (const link of pairLinks) {
      if (tokens.length >= targetCount * 3) break; // gather 3x buffer for filtering

      const chain = normalizeChainId(link.chain);
      if (!chain || chain === "pools" || chain === "new" || chain === "trending") continue;

      try {
        // Fetch pair data from API using pairAddress
        const data = await fetchJson(
          `https://api.dexscreener.com/latest/dex/pairs/${chain}/${link.pairAddress}`
        );
        const pair = (data.pairs || [])[0];
        if (!pair) continue;

        const tokenAddress = pair?.baseToken?.address || "";
        const symbol = pair?.baseToken?.symbol || "";
        const name = pair?.baseToken?.name || symbol;
        const chainId = normalizeChainId(pair?.chainId || chain);
        const links = [
          ...(pair?.info?.socials || []),
          ...(pair?.info?.links || []),
        ];

        tokens.push({ name, symbol, chainId, tokenAddress, links });
        await sleep(80);
      } catch {
        // Skip failed pairs silently
      }
    }

    onProgress?.({ type: "info", text: `Resolved ${tokens.length} tokens with metadata.` });
    return tokens;
  } finally {
    await browser.close();
  }
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

async function scrapeDexScreener(dexUrl, onProgress) {
  const seenGlobal = loadSeenDexKeys();
  const socialsCache = new Map();
  const results = [];
  let skippedKnown = 0;
  let skippedNoTg = 0;

  onProgress?.({
    type: "info",
    text: `Scraping exactly what your URL shows: ${dexUrl}`,
  });
  onProgress?.({
    type: "info",
    text: `Loaded ${seenGlobal.size} previously seen tokens (dedup memory).`,
  });

  // Step 1: Get tokens from the actual rendered page
  let candidates = [];
  try {
    candidates = await scrapeTokensFromPage(dexUrl, TARGET_COUNT, onProgress);
  } catch (err) {
    onProgress?.({ type: "skip", text: `Browser scrape failed: ${err.message}` });
  }

  if (candidates.length === 0) {
    onProgress?.({ type: "skip", text: "No tokens found on the page. Check your URL." });
  }

  // Step 2: Enrich and filter candidates
  for (const candidate of candidates) {
    if (results.length >= TARGET_COUNT) break;

    // Try to get socials from inline links first
    let { tgLink, xLink, discordLink } = extractSocials(candidate.links || []);

    // Fall back to token API if socials missing
    if (!tgLink && candidate.tokenAddress) {
      let cached = socialsCache.get(candidate.tokenAddress);
      if (!cached) {
        cached = await fetchTokenSocials(candidate.tokenAddress);
        socialsCache.set(candidate.tokenAddress, cached);
      }
      if (!tgLink) tgLink = cached.tgLink;
      if (!xLink) xLink = cached.xLink;
      if (!discordLink) discordLink = cached.discordLink;
    }

    if (!tgLink) {
      skippedNoTg++;
      continue;
    }

    // Build dedup key
    const chain = candidate.chainId || "unknown";
    const key = candidate.tokenAddress
      ? `${chain}:${candidate.tokenAddress.toLowerCase()}`
      : `tg:${normalizeTgLink(tgLink)}`;

    if (seenGlobal.has(key)) {
      skippedKnown++;
      continue;
    }

    seenGlobal.add(key);

    const symbol = candidate.symbol
      ? `$${String(candidate.symbol).toUpperCase().replace(/^\$/, "").slice(0, 20)}`
      : String(candidate.name || "Unknown").slice(0, 30);

    const row = {
      name: symbol,
      tgLink,
      xLink: xLink || null,
      discordLink: discordLink || null,
      chainId: chain,
      tokenAddress: candidate.tokenAddress || "",
    };

    results.push(row);
    onProgress?.({
      type: "found",
      text: `✅ [${results.length}/${TARGET_COUNT}] ${row.name} (${row.chainId})`,
    });
  }

  // Save results
  saveSeenDexKeys(seenGlobal);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  const entry = {
    id: Date.now(),
    scrapedAt: new Date().toISOString(),
    url: dexUrl,
    count: results.length,
    withX: results.filter((r) => r.xLink).length,
    withDiscord: results.filter((r) => r.discordLink).length,
    mode: "playwright-dynamic",
    results,
  };
  saveHistory(entry);

  onProgress?.({
    type: "info",
    text: `Summary: ${results.length} found | ${skippedKnown} already seen | ${skippedNoTg} no Telegram.`,
  });
  onProgress?.({ type: "done", text: `🎉 Done! ${results.length} tokens scraped from your exact filter.` });

  return { results, historyEntry: entry };
}

module.exports = {
  scrapeDexScreener,
  loadHistory,
  clearDexSeenMemory,
};