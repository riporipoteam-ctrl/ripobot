'use strict';

/**
 * Lightweight web search for the AI chat pipeline (no new dependencies).
 *
 * - shouldSearch(text): cheap regex-only heuristic that decides whether a
 *   user message needs fresh web results (no model call).
 * - webSearch(query, limit): three-tier, all keyless and bot-friendly:
 *     1. Google News RSS — genuinely fresh headlines with dates (best for
 *        news/current-event queries).
 *     2. DuckDuckGo lite — general web results (flaky on datacenter IPs,
 *        sometimes serves challenge pages).
 *     3. Wikipedia API — reliable factual summaries (opensearch + page
 *        summary) for "what is X" queries.
 *   Returns a formatted result block for prompt injection — or null on
 *   total failure. Never throws.
 *
 * Every network call is wrapped in try/catch with an AbortController
 * timeout. Neither function ever throws.
 */

const GNEWS_RSS_URL = 'https://news.google.com/rss/search?q=';
const DDG_LITE_URL = 'https://lite.duckduckgo.com/lite/?q=';
const WIKI_SEARCH_URL = 'https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&format=json&search=';
const WIKI_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const TIMEOUT_MS = 10000;

// Cheap heuristic: explicit "search:" prefix, or keywords that imply the
// answer changes over time / needs fresh data.
const EXPLICIT_SEARCH_RE = /^\s*search:/i;
const FRESHNESS_RE =
  /\b(who won|score|price of|how much is|breaking|news|today|yesterday|latest|current|stock|election|weather)\b/i;

/**
 * Return true if the message looks like it needs a web search.
 * Pure regex — no model call, cheap enough to run on every message.
 */
function shouldSearch(text) {
  if (typeof text !== 'string' || text.trim() === '') return false;
  if (EXPLICIT_SEARCH_RE.test(text)) return true;
  return FRESHNESS_RE.test(text);
}

function decodeEntities(s) {
  return s
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).trim();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.error('[websearch] fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract <tag>...</tag> (or <tag attr>...</tag>) content from an XML block. */
function xmlTag(tag, block) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
}

/**
 * Tier 1 — Google News RSS. Returns [{ title, url, snippet }] where the
 * snippet is "Source Name, pubDate". Genuinely fresh; ideal for news.
 */
async function googleNewsSearch(query, limit) {
  const url = GNEWS_RSS_URL + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
  const xml = await fetchText(url);
  if (!xml || !xml.includes('<item>')) {
    if (xml) console.error('[websearch] Google News returned no items');
    return [];
  }
  const entries = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && entries.length < limit) {
    const block = m[1];
    const title = xmlTag('title', block);
    if (!title) continue;
    entries.push({
      title,
      url: xmlTag('link', block),
      snippet: [xmlTag('source', block), xmlTag('pubDate', block)].filter(Boolean).join(' — '),
    });
  }
  return entries;
}

/**
 * DuckDuckGo hrefs are often redirect URLs like
 * //duckduckgo.com/l/?uddg=<urlencoded> — decode the uddg param when present.
 */
function unwrapDdgUrl(href) {
  if (typeof href !== 'string' || href === '') return '';
  let url = href.trim();
  if (url.startsWith('//')) url = 'https:' + url;
  const m = /[?&]uddg=([^&]+)/.exec(url);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return url; // bad encoding — keep the redirect URL
    }
  }
  return url;
}

/**
 * Tier 2 — DuckDuckGo lite. Lite uses single-quoted attributes:
 *   <a ... href="..." class='result-link'>Title</a>
 *   <td class='result-snippet'>snippet html</td>
 */
async function ddgLiteSearch(query, limit) {
  const html = await fetchText(DDG_LITE_URL + encodeURIComponent(query));
  if (!html || html.length === 0) return [];
  const positions = [];
  const linkRe = /<a[^>]*href="([^"]*)"[^>]*class='result-link'[^>]*>/gi;
  let lm;
  while ((lm = linkRe.exec(html)) !== null && positions.length < limit) {
    const titleStart = linkRe.lastIndex;
    const titleEnd = html.indexOf('</a>', titleStart);
    if (titleEnd === -1) continue;
    positions.push({
      start: lm.index,
      end: titleEnd + 4,
      href: lm[1],
      title: stripTags(html.slice(titleStart, titleEnd)),
    });
    linkRe.lastIndex = titleEnd + 4;
  }
  const snippetRe = /<td[^>]*class='result-snippet'[^>]*>([\s\S]*?)<\/td>/i;
  const entries = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const regionEnd = i + 1 < positions.length ? positions[i + 1].start : Math.min(html.length, p.end + 6000);
    const sm = snippetRe.exec(html.slice(p.end, regionEnd));
    const entry = {
      title: p.title,
      url: unwrapDdgUrl(p.href),
      snippet: sm ? stripTags(sm[1]) : '',
    };
    if (entry.title || entry.snippet) entries.push(entry);
  }
  if (entries.length === 0) console.error('[websearch] DDG lite returned no parseable results (likely challenged)');
  return entries;
}

/**
 * Trim a natural-language question down to keywords for Wikipedia's
 * opensearch (it matches almost nothing for long queries like
 * "what is the latest GTA 6 news" — "gta 6" works).
 */
function wikiQuery(query) {
  const stop = new Set(
    'what,whats,who,which,whom,whose,when,where,why,how,is,are,was,were,be,been,being,do,does,did,the,a,an,of,to,for,in,on,at,by,with,about,latest,newest,news,today,yesterday,current,recently,update,updates,updated,tell,me,give,show,find,search,please,any,there,here'.split(','),
  );
  const words = String(query)
    .toLowerCase()
    .replace(/['"]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !stop.has(w));
  return words.slice(0, 6).join(' ');
}

/**
 * Tier 3 — Wikipedia: opensearch for the top titles, then page summaries.
 * Very bot-friendly — works where DDG challenges datacenter IPs.
 */
async function wikiSearch(query, limit) {
  try {
    const keywords = wikiQuery(query);
    if (!keywords) return [];
    const raw = await fetchText(WIKI_SEARCH_URL + encodeURIComponent(keywords));
    if (!raw) return [];
    const data = JSON.parse(raw);
    const titles = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
    const entries = [];
    for (const title of titles.slice(0, Math.min(limit, 2))) {
      const sumRaw = await fetchText(WIKI_SUMMARY_URL + encodeURIComponent(title));
      if (!sumRaw) continue;
      const sum = JSON.parse(sumRaw);
      if (sum && sum.extract) {
        entries.push({
          title: sum.title || title,
          url: (sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
          snippet: String(sum.extract).slice(0, 600),
        });
      }
    }
    return entries;
  } catch (err) {
    console.error('[websearch] wikipedia failed:', err.message);
    return [];
  }
}

function formatResults(entries, sourceLabel, today) {
  const lines = [`Web search results (${sourceLabel} — fresh as of ${today}):`];
  let n = 0;
  for (const e of entries) {
    n += 1;
    lines.push(`${n}. ${e.title || '(no title)'}`);
    if (e.snippet) lines.push(`   ${e.snippet}`);
    if (e.url) lines.push(`   ${e.url}`);
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

/**
 * Run a web search for `query`. Returns a formatted string for prompt
 * injection, or null when nothing usable came back. Never throws.
 */
async function webSearch(query, limit = 5) {
  if (typeof query !== 'string' || query.trim() === '') return null;
  limit = Math.max(1, Math.min(Number(limit) || 5, 10));
  const today = new Date().toISOString().slice(0, 10);

  // Tier 1: Google News RSS — genuinely fresh headlines with dates.
  const news = await googleNewsSearch(query, limit).catch(() => []);
  if (news.length > 0) return formatResults(news, 'Google News', today);

  // Tier 2: DuckDuckGo lite — general web results.
  const ddg = await ddgLiteSearch(query, limit).catch(() => []);
  if (ddg.length > 0) return formatResults(ddg, 'DuckDuckGo', today);

  // Tier 3: Wikipedia — reliable factual summaries.
  const wiki = await wikiSearch(query, limit).catch(() => []);
  if (wiki.length > 0) return formatResults(wiki, 'Wikipedia', today);

  return null;
}

module.exports = { shouldSearch, webSearch };
