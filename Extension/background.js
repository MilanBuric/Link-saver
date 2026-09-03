importScripts("categorize.js", "sync.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "link-saver-save-page",
    title: "Save page to Link Saver",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "link-saver-save-link",
    title: "Save link to Link Saver",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isLinkClick = info.menuItemId === "link-saver-save-link";
  const url = isLinkClick ? info.linkUrl : info.pageUrl;
  if (!url) return;

  const title = isLinkClick ? url : tab?.title || url;
  await saveLinkFromContextMenu(url, title);
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function saveLinkFromContextMenu(url, title) {
  const stored = await chrome.storage.local.get([
    "leads",
    "categories",
    "syncEnabled",
  ]);
  const leads = stored.leads || [];
  const categories =
    stored.categories && stored.categories.length
      ? stored.categories
      : DEFAULT_CATEGORIES.slice();

  const isDuplicate = leads.some(
    (lead) =>
      (typeof lead === "object" &&
        lead !== null &&
        (lead.url === url || lead.originalUrl === url)) ||
      (typeof lead === "string" && lead === url),
  );
  if (isDuplicate) {
    notifyUser("Already saved", "This link is already in Link Saver.");
    return;
  }

  const result = await categorizeLeadShared(title, url, categories, {
    allowAI: true,
  });
  if (result.newCategory && !categories.includes(result.newCategory)) {
    categories.push(result.newCategory);
  }

  leads.push({
    id: generateId(),
    url,
    title: title || url,
    originalUrl: url,
    category: result.category,
    addedAt: Date.now(),
  });

  const lastModified = Date.now();
  await chrome.storage.local.set({ leads, categories, lastModified });

  if (stored.syncEnabled) {
    await pushToSyncShared(leads, categories, lastModified);
  }

  notifyUser("Saved to Link Saver", `Sorted into "${result.category}".`);
}

function notifyUser(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title,
      message,
    });
  }
}
