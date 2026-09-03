// Shared categorization logic — domain rules + AI fallback.
// Loaded by both index.html (popup) and background.js (service worker) as a
// plain classic script, so these become globals in whichever context loads it.
// No shared state between contexts — categories is always passed in explicitly.

const DEFAULT_CATEGORIES = [
  "Development",
  "Video",
  "Social",
  "Shopping",
  "Docs & Tools",
  "News & Reading",
  "Other",
];

// Domain lists per category (plain strings, no regex — safe to extend by hand).
// Checked in array order; first category whose list contains a match wins.
const DOMAIN_RULES = [
  {
    category: "Development",
    domains: [
      "github.com",
      "gitlab.com",
      "bitbucket.org",
      "stackoverflow.com",
      "npmjs.com",
      "developer.mozilla.org",
    ],
  },
  {
    category: "Gaming",
    domains: [
      "nexusmods.com",
      "steampowered.com",
      "twitch.tv",
      "ign.com",
      "epicgames.com",
      "battle.net",
      "gog.com",
      "moddb.com",
    ],
  },
  { category: "Video", domains: ["youtube.com", "youtu.be", "vimeo.com"] },
  {
    category: "Social",
    domains: [
      "reddit.com",
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "linkedin.com",
      "tiktok.com",
    ],
  },
  {
    category: "Shopping",
    domains: ["amazon.", "ebay.", "etsy.com", "aliexpress.com"],
  },
  {
    category: "Docs & Tools",
    domains: [
      "docs.google.com",
      "drive.google.com",
      "notion.so",
      "pdf24.org",
      "dropbox.com",
    ],
  },
  {
    category: "News & Reading",
    domains: ["wikipedia.org", "medium.com", "nytimes.com", "bbc."],
  },
];

function matchDomainRule(host) {
  for (const rule of DOMAIN_RULES) {
    if (rule.domains.some((d) => host.includes(d))) {
      return rule.category;
    }
  }
  return null;
}

function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

async function classifyWithAI(apiKey, title, url, existingCategories) {
  const prompt = `You are sorting a saved browser link into a category.
Title: ${title || "(no title)"}
URL: ${url}

Existing categories: ${existingCategories.join(", ")}

Pick the single best-fitting existing category, OR if none fit well, invent a new short category name (1-2 words, Title Case). Do not answer "Other" — always either pick a real match or invent a specific one.
Respond with ONLY a JSON object, no other text: {"category": "<name>"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        await response.text(),
      );
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const category = (parsed.category || "").trim();
    return category || null;
  } catch (err) {
    console.error("AI categorization failed:", err);
    return null;
  }
}

// categories is passed in explicitly (never a shared global) since the popup
// and the background worker are separate JS contexts with separate memory.
// Returns { category, usedAI, newCategory }. newCategory is set when the AI
// invented a name not already in the list, so the caller can add it.
async function categorizeLeadShared(
  title,
  url,
  categories,
  { allowAI = true } = {},
) {
  const host = extractHostname(url || "");

  if (allowAI) {
    const { aiApiKey = "" } = await chrome.storage.local.get(["aiApiKey"]);
    if (aiApiKey) {
      const aiCategory = await classifyWithAI(
        aiApiKey,
        title,
        url,
        categories.filter((c) => c !== "Other"),
      );
      if (aiCategory) {
        const newCategory = categories.includes(aiCategory) ? null : aiCategory;
        return { category: aiCategory, usedAI: true, newCategory };
      }
      // AI call failed or returned nothing usable — fall through to rules
    }
  }

  const matched = matchDomainRule(host);
  if (matched) {
    return { category: matched, usedAI: false, newCategory: null };
  }

  return { category: "Other", usedAI: false, newCategory: null };
}
