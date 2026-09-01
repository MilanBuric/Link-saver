// ---- Constants ----
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

const CATEGORY_COLORS = [
  "#5865e0",
  "#e07a58",
  "#58c7e0",
  "#a058e0",
  "#5be080",
  "#e0c258",
  "#e05880",
];

// ---- Elements ----
const inputBtn = document.getElementById("input-btn");
const inputEl = document.getElementById("input-el");
const ulEl = document.getElementById("ul-el");
const emptyState = document.getElementById("empty-state");
const deleteSelectedBtn = document.getElementById("delete-selected-btn");
const deleteCategoryLinksBtn = document.getElementById(
  "delete-category-links-btn",
);
const saveTabBtn = document.getElementById("save-tab-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const saveKeyBtn = document.getElementById("save-key-btn");
const keyStatus = document.getElementById("key-status");
const aiKeyInput = document.getElementById("ai-key-input");
const saveAiKeyBtn = document.getElementById("save-ai-key-btn");
const aiKeyStatus = document.getElementById("ai-key-status");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const categoriesView = document.getElementById("categories-view");
const detailView = document.getElementById("detail-view");
const categoryList = document.getElementById("category-list");
const detailTitle = document.getElementById("detail-title");
const backBtn = document.getElementById("back-btn");
const newCategoryBtn = document.getElementById("new-category-btn");
const toastEl = document.getElementById("toast");
const searchInput = document.getElementById("search-input");
const searchView = document.getElementById("search-view");
const searchResultsEl = document.getElementById("search-results-el");
const searchEmptyState = document.getElementById("search-empty-state");
const sortSelect = document.getElementById("sort-select");
const checkLinksBtn = document.getElementById("check-links-btn");
const exportFormatSelect = document.getElementById("export-format");
const importBookmarksBtn = document.getElementById("import-bookmarks-btn");

// ---- State ----
let myleads = [];
let categories = [...DEFAULT_CATEGORIES];
let currentCategory = null; // null = home/category-list view
let toastTimer = null;
let sortOrder = "newest";

// ---- Init ----
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const stored = await chrome.storage.local.get([
    "leads",
    "categories",
    "tinyurlApiKey",
    "aiApiKey",
    "sortOrder",
  ]);
  categories =
    stored.categories && stored.categories.length
      ? stored.categories
      : [...DEFAULT_CATEGORIES];
  myleads = stored.leads || [];
  sortOrder = stored.sortOrder || "newest";
  sortSelect.value = sortOrder;

  if (stored.tinyurlApiKey)
    keyStatus.textContent = "A key is saved on this device.";
  if (stored.aiApiKey)
    aiKeyStatus.textContent = "A key is saved on this device.";

  await migrateLeadsIfNeeded();
  renderCategories();
}

// Older saved links won't have an id/category yet — assign both once.
// Rule-based categorization is free; AI is only used if a key is set,
// capped here to avoid a burst of calls on first load with a big list.
async function migrateLeadsIfNeeded() {
  let changed = false;
  let aiCallsUsed = 0;
  const AI_MIGRATION_CAP = 15;

  for (const lead of myleads) {
    if (typeof lead !== "object" || lead === null) continue;
    if (!lead.id) {
      lead.id = generateId();
      changed = true;
    }
    if (!lead.addedAt) {
      lead.addedAt = Date.now();
      changed = true;
    }
    if (!lead.category) {
      const allowAI = aiCallsUsed < AI_MIGRATION_CAP;
      const result = await categorizeLead(
        lead.title,
        lead.originalUrl || lead.url,
        { allowAI },
      );
      lead.category = result.category;
      if (result.usedAI) aiCallsUsed++;
      changed = true;
    }
  }

  if (changed) {
    await persistLeads();
    await persistCategories();
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function categoryColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3500);
}

async function persistLeads() {
  await chrome.storage.local.set({ leads: myleads });
}

async function persistCategories() {
  await chrome.storage.local.set({ categories });
}

// ---- Categorization ----
// AI first (if a key is set) so it can catch nuance a domain alone can't —
// e.g. a gaming video on youtube.com instead of it always landing in Video.
// Domain rules are the fallback: used when no key is set, or if the AI call
// fails/returns nothing usable. Returns { category, usedAI }.
async function categorizeLead(title, url, { allowAI = true } = {}) {
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
        if (!categories.includes(aiCategory)) {
          categories.push(aiCategory);
        }
        return { category: aiCategory, usedAI: true };
      }
      // AI call failed or returned nothing usable — fall through to rules
    }
  }

  const matched = matchDomainRule(host);
  if (matched) {
    return { category: matched, usedAI: false };
  }

  return { category: "Other", usedAI: false };
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

// ---- Duplicate check ----
function isDuplicate(url) {
  return myleads.some(
    (lead) =>
      (typeof lead === "object" &&
        lead !== null &&
        (lead.url === url || lead.originalUrl === url)) ||
      (typeof lead === "string" && lead === url),
  );
}

// ---- Save typed input ----
inputBtn.addEventListener("click", async () => {
  const inputValue = inputEl.value.trim();
  if (!inputValue) return;

  if (isDuplicate(inputValue)) {
    showToast("This URL is already saved.");
    return;
  }

  inputBtn.disabled = true;
  inputBtn.textContent = "Saving...";
  try {
    const title = await fetchPageTitle(inputValue);
    const { category } = await categorizeLead(title, inputValue);
    myleads.push({
      id: generateId(),
      url: inputValue,
      title,
      category,
      addedAt: Date.now(),
    });

    await persistLeads();
    await persistCategories();
    inputEl.value = "";
    showToast(`Saved to "${category}".`);
    renderCurrentView();
  } finally {
    inputBtn.disabled = false;
    inputBtn.textContent = "Save input";
  }
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    inputBtn.click();
  }
});

// ---- Save current tab ----
saveTabBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url;

  if (!currentUrl) {
    showToast("Couldn't read this tab's URL.");
    return;
  }
  if (isDuplicate(currentUrl)) {
    showToast("This URL is already saved.");
    return;
  }

  saveTabBtn.disabled = true;
  saveTabBtn.textContent = "Saving...";
  try {
    const shortUrl = await shortenUrl(currentUrl);
    if (isDuplicate(shortUrl)) {
      showToast("This URL is already saved.");
      return;
    }

    const title = tab.title || extractHostname(currentUrl);
    const { category } = await categorizeLead(title, currentUrl);

    myleads.push({
      id: generateId(),
      url: shortUrl,
      title,
      originalUrl: currentUrl,
      category,
      addedAt: Date.now(),
    });

    await persistLeads();
    await persistCategories();
    showToast(`Saved to "${category}".`);
    renderCurrentView();
  } finally {
    saveTabBtn.disabled = false;
    saveTabBtn.textContent = "Save current tab";
  }
});

// ---- Delete selected (within current category) ----
deleteSelectedBtn.addEventListener("click", async () => {
  const checkboxes = document.querySelectorAll(".lead-checkbox:checked");
  if (checkboxes.length === 0) {
    showToast("No links selected.");
    return;
  }

  const idsToRemove = new Set(
    Array.from(checkboxes).map((cb) => cb.dataset.id),
  );
  myleads = myleads.filter((lead) => !idsToRemove.has(lead.id));

  await persistLeads();
  renderCurrentView();
});

// ---- Delete all links in the open category ----
deleteCategoryLinksBtn.addEventListener("click", async () => {
  if (!currentCategory) return;
  const count = myleads.filter((l) => l.category === currentCategory).length;
  if (count === 0) return;
  if (!confirm(`Delete all ${count} link(s) in "${currentCategory}"?`)) return;

  myleads = myleads.filter((lead) => lead.category !== currentCategory);
  await persistLeads();
  renderCurrentView();
});

// ---- Helpers ----
function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
}

function renderCurrentView() {
  if (searchInput.value.trim()) {
    renderSearch();
  } else if (currentCategory) {
    renderDetail();
  } else {
    renderCategories();
  }
}

function sortLeads(list, order) {
  const copy = [...list];
  switch (order) {
    case "oldest":
      return copy.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    case "az":
      return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "recent":
      return copy.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
    case "newest":
    default:
      return copy.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
}

// Builds one <li> for a lead. showCategoryTag=true is used in the search
// view, where items come from multiple categories at once.
function buildLeadListItem(lead, { showCategoryTag = false } = {}) {
  const li = document.createElement("li");

  const checkboxWrapper = document.createElement("div");
  checkboxWrapper.className = "checkbox-wrapper";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "lead-checkbox";
  checkbox.dataset.id = lead.id;
  checkboxWrapper.appendChild(checkbox);

  const linkWrapper = document.createElement("div");
  linkWrapper.className = "link-wrapper";

  const a = document.createElement("a");
  const url = lead.url;
  const title = lead.title || extractHostname(lead.url);
  const originalUrl = lead.originalUrl || url;

  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = originalUrl;
  a.addEventListener("click", () => {
    lead.lastOpened = Date.now();
    persistLeads();
  });

  const favicon = document.createElement("img");
  favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(originalUrl)}`;
  favicon.width = 16;
  favicon.height = 16;
  favicon.style.marginRight = "8px";
  favicon.alt = "";

  a.appendChild(favicon);
  a.appendChild(document.createTextNode(title));
  linkWrapper.appendChild(a);

  li.appendChild(checkboxWrapper);
  li.appendChild(linkWrapper);

  if (showCategoryTag) {
    const tag = document.createElement("span");
    tag.className = "category-tag";
    tag.textContent = lead.category || "Other";
    li.appendChild(tag);
  }

  const statusEl = document.createElement("span");
  statusEl.className = `link-status ${lead.checkStatus || ""}`;
  statusEl.title =
    lead.checkStatus === "broken"
      ? `Broken (status ${lead.checkStatusCode || "?"})`
      : lead.checkStatus === "ok"
        ? "Reachable"
        : lead.checkStatus === "checking"
          ? "Checking..."
          : lead.checkStatus === "unknown"
            ? "Couldn't verify"
            : "Not checked yet";
  statusEl.textContent =
    lead.checkStatus === "broken"
      ? "⚠"
      : lead.checkStatus === "ok"
        ? "✓"
        : lead.checkStatus === "checking"
          ? "…"
          : lead.checkStatus === "unknown"
            ? "?"
            : "";
  li.appendChild(statusEl);

  if (!showCategoryTag) {
    const moveSelect = document.createElement("select");
    moveSelect.className = "move-select";
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      if (cat === lead.category) opt.selected = true;
      moveSelect.appendChild(opt);
    });
    moveSelect.addEventListener("change", async () => {
      lead.category = moveSelect.value;
      await persistLeads();
      renderCurrentView();
    });
    li.appendChild(moveSelect);
  }

  return li;
}

// ---- Search ----
let searchDebounce = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(renderCurrentView, 150);
});

function renderSearch() {
  const query = searchInput.value.trim().toLowerCase();
  categoriesView.classList.add("hidden");
  detailView.classList.add("hidden");
  searchView.classList.remove("hidden");

  const matches = myleads.filter((lead) => {
    if (typeof lead !== "object" || lead === null) return false;
    const title = (lead.title || "").toLowerCase();
    const url = (lead.url || "").toLowerCase();
    const originalUrl = (lead.originalUrl || "").toLowerCase();
    return (
      title.includes(query) ||
      url.includes(query) ||
      originalUrl.includes(query)
    );
  });

  const sorted = sortLeads(matches, sortOrder);
  searchResultsEl.innerHTML = "";

  if (sorted.length === 0) {
    searchEmptyState.classList.remove("hidden");
    return;
  }
  searchEmptyState.classList.add("hidden");

  sorted.forEach((lead) => {
    searchResultsEl.appendChild(
      buildLeadListItem(lead, { showCategoryTag: true }),
    );
  });
}

// ---- Category list (home) ----
function renderCategories() {
  categoriesView.classList.remove("hidden");
  detailView.classList.add("hidden");
  searchView.classList.add("hidden");
  categoryList.innerHTML = "";

  categories.forEach((name) => {
    const count = myleads.filter(
      (l) => (typeof l === "object" ? l.category : "Other") === name,
    ).length;

    const li = document.createElement("li");
    li.className = "category-row";

    const dot = document.createElement("span");
    dot.className = "category-dot";
    dot.style.backgroundColor = categoryColor(name);

    const nameEl = document.createElement("span");
    nameEl.className = "category-name";
    nameEl.textContent = name;

    const countEl = document.createElement("span");
    countEl.className = "category-count";
    countEl.textContent = count;

    li.appendChild(dot);
    li.appendChild(nameEl);
    li.appendChild(countEl);

    if (name !== "Other") {
      const delBtn = document.createElement("button");
      delBtn.className = "category-delete";
      delBtn.textContent = "✕";
      delBtn.title = `Delete "${name}"`;
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteCategory(name);
      });
      li.appendChild(delBtn);
    }

    const chevron = document.createElement("span");
    chevron.className = "category-chevron";
    chevron.textContent = "›";
    li.appendChild(chevron);

    li.addEventListener("click", () => openCategory(name));
    categoryList.appendChild(li);
  });
}

async function deleteCategory(name) {
  const count = myleads.filter((l) => l.category === name).length;
  const msg =
    count > 0
      ? `Delete "${name}"? ${count} link(s) inside will move to "Other".`
      : `Delete "${name}"?`;
  if (!confirm(msg)) return;

  myleads.forEach((lead) => {
    if (lead.category === name) lead.category = "Other";
  });
  categories = categories.filter((c) => c !== name);

  await persistLeads();
  await persistCategories();
  renderCategories();
}

newCategoryBtn.addEventListener("click", async () => {
  const name = prompt("New category name:");
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (categories.includes(trimmed)) {
    showToast("That category already exists.");
    return;
  }
  categories.push(trimmed);
  await persistCategories();
  renderCategories();
});

function openCategory(name) {
  currentCategory = name;
  searchInput.value = "";
  renderDetail();
}

backBtn.addEventListener("click", () => {
  currentCategory = null;
  searchInput.value = "";
  renderCategories();
});

// ---- Category detail ----
function renderDetail() {
  categoriesView.classList.add("hidden");
  searchView.classList.add("hidden");
  detailView.classList.remove("hidden");
  detailTitle.textContent = currentCategory;

  const items = myleads.filter(
    (lead) =>
      (typeof lead === "object" ? lead.category : "Other") === currentCategory,
  );
  const sorted = sortLeads(items, sortOrder);

  ulEl.innerHTML = "";

  if (sorted.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  sorted.forEach((lead) => {
    ulEl.appendChild(buildLeadListItem(lead, { showCategoryTag: false }));
  });
}

sortSelect.addEventListener("change", async () => {
  sortOrder = sortSelect.value;
  await chrome.storage.local.set({ sortOrder });
  renderCurrentView();
});

// ---- Broken-link checker ----
checkLinksBtn.addEventListener("click", async () => {
  if (!currentCategory) return;
  const items = myleads.filter((l) => l.category === currentCategory);
  if (items.length === 0) return;

  checkLinksBtn.disabled = true;
  checkLinksBtn.textContent = "Checking...";
  items.forEach((lead) => {
    lead.checkStatus = "checking";
  });
  renderDetail();

  await Promise.all(
    items.map(async (lead) => {
      const targetUrl = lead.originalUrl || lead.url;
      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          cache: "no-store",
        });
        lead.checkStatus = response.ok ? "ok" : "broken";
        lead.checkStatusCode = response.status;
      } catch (err) {
        // Network failure, dead domain, or a site that blocks non-browser
        // fetches — can't confirm broken vs. just unreachable from here.
        lead.checkStatus = "unknown";
      }
      lead.lastChecked = Date.now();
    }),
  );

  await persistLeads();
  checkLinksBtn.disabled = false;
  checkLinksBtn.textContent = "Check links";
  renderDetail();

  const brokenCount = items.filter((l) => l.checkStatus === "broken").length;
  showToast(
    brokenCount > 0
      ? `${brokenCount} broken link(s) found.`
      : "All links checked — none confirmed broken.",
  );
});

// ---- TinyURL shortening ----
async function shortenUrl(longUrl) {
  const { tinyurlApiKey = "" } = await chrome.storage.local.get([
    "tinyurlApiKey",
  ]);
  if (!tinyurlApiKey) return longUrl;

  try {
    const response = await fetch("https://api.tinyurl.com/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tinyurlApiKey}`,
      },
      body: JSON.stringify({ url: longUrl, domain: "tiny.one" }),
    });
    const data = await response.json();
    if (data?.data?.tiny_url) return data.data.tiny_url;
    console.warn("TinyURL did not return a short link; saving original.");
    return longUrl;
  } catch (err) {
    console.error("Error shortening URL:", err);
    return longUrl;
  }
}

// ---- Page title fetch (best-effort; blocked by CORS on most sites) ----
async function fetchPageTitle(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const title = doc.querySelector("title");
    return title ? title.textContent : extractHostname(url);
  } catch (e) {
    return extractHostname(url);
  }
}

// ---- Settings ----
settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  await chrome.storage.local.set({ tinyurlApiKey: key });
  apiKeyInput.value = "";
  keyStatus.textContent = key ? "Key saved on this device." : "Key removed.";
});

saveAiKeyBtn.addEventListener("click", async () => {
  const key = aiKeyInput.value.trim();
  await chrome.storage.local.set({ aiApiKey: key });
  aiKeyInput.value = "";
  aiKeyStatus.textContent = key ? "Key saved on this device." : "Key removed.";
});

// ---- Export ----
exportBtn.addEventListener("click", async () => {
  const { leads = [] } = await chrome.storage.local.get(["leads"]);
  const format = exportFormatSelect.value;

  let dataStr, filename, mime;

  if (format === "markdown") {
    const byCategory = {};
    leads.forEach((lead) => {
      const cat = (typeof lead === "object" && lead.category) || "Other";
      (byCategory[cat] = byCategory[cat] || []).push(lead);
    });
    let md = "# Saved Links\n\n";
    Object.keys(byCategory)
      .sort()
      .forEach((cat) => {
        md += `## ${cat}\n\n`;
        byCategory[cat].forEach((lead) => {
          const url = typeof lead === "object" ? lead.url : lead;
          const title =
            (typeof lead === "object" && lead.title) || extractHostname(url);
          md += `- [${title}](${url})\n`;
        });
        md += "\n";
      });
    dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    filename = "saved_links.md";
  } else if (format === "html") {
    // Netscape Bookmark format — importable into any browser.
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
    const byCategory = {};
    leads.forEach((lead) => {
      const cat = (typeof lead === "object" && lead.category) || "Other";
      (byCategory[cat] = byCategory[cat] || []).push(lead);
    });
    Object.keys(byCategory)
      .sort()
      .forEach((cat) => {
        html += `    <DT><H3>${escapeHtml(cat)}</H3>\n    <DL><p>\n`;
        byCategory[cat].forEach((lead) => {
          const url = typeof lead === "object" ? lead.url : lead;
          const title =
            (typeof lead === "object" && lead.title) || extractHostname(url);
          html += `        <DT><A HREF="${escapeHtml(url)}">${escapeHtml(title)}</A>\n`;
        });
        html += `    </DL><p>\n`;
      });
    html += `</DL><p>\n`;
    dataStr = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    filename = "saved_links_bookmarks.html";
  } else {
    dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(leads));
    filename = "saved_links.json";
  }

  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Import from Chrome bookmarks ----
importBookmarksBtn.addEventListener("click", async () => {
  importBookmarksBtn.disabled = true;
  importBookmarksBtn.textContent = "Importing...";
  try {
    const tree = await chrome.bookmarks.getTree();
    const flat = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.url) flat.push({ url: node.url, title: node.title });
        if (node.children) walk(node.children);
      }
    };
    walk(tree);

    let added = 0;
    for (const bm of flat) {
      if (!bm.url || !/^https?:\/\//.test(bm.url) || isDuplicate(bm.url))
        continue;

      const { category } = await categorizeLead(bm.title, bm.url, {
        allowAI: false,
      });
      myleads.push({
        id: generateId(),
        url: bm.url,
        title: bm.title || extractHostname(bm.url),
        originalUrl: bm.url,
        category,
        addedAt: Date.now(),
      });
      added++;
    }

    await persistLeads();
    await persistCategories();
    renderCurrentView();
    showToast(`Imported ${added} bookmark(s).`);
  } catch (err) {
    console.error("Bookmark import failed:", err);
    showToast("Couldn't read Chrome bookmarks.");
  } finally {
    importBookmarksBtn.disabled = false;
    importBookmarksBtn.textContent = "Import Chrome bookmarks";
  }
});

// ---- Import ----
importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedLinks = JSON.parse(event.target.result);
      if (!Array.isArray(importedLinks)) {
        showToast("Invalid file format.");
        return;
      }

      // Rule-based only for bulk import (skips AI even if a key is set,
      // to avoid a burst of calls on a large file). Recategorize manually after.
      let added = 0;
      for (const item of importedLinks) {
        const url = typeof item === "object" && item !== null ? item.url : item;
        if (!url || isDuplicate(url)) continue;

        const title =
          typeof item === "object" && item !== null
            ? item.title
            : extractHostname(item);
        const originalUrl =
          (typeof item === "object" && item.originalUrl) || url;
        const { category } = await categorizeLead(title, originalUrl, {
          allowAI: false,
        });

        myleads.push({
          id: generateId(),
          url,
          title: title || extractHostname(url),
          originalUrl,
          category,
          addedAt: Date.now(),
        });
        added++;
      }

      await persistLeads();
      await persistCategories();
      renderCurrentView();
      showToast(`Imported ${added} link(s).`);
    } catch (e) {
      showToast("Couldn't read that file.");
    } finally {
      importFile.value = "";
    }
  };
  reader.readAsText(file);
});
