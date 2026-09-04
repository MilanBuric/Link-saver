importScripts("categorize.js", "sync.js");

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "link-saver-save-page",
        title: "Save page to Link Saver",
        contexts: ["page"]
    });
    chrome.contextMenus.create({
        id: "link-saver-save-link",
        title: "Save link to Link Saver",
        contexts: ["link"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const isLinkClick = info.menuItemId === "link-saver-save-link";
    const url = isLinkClick ? info.linkUrl : info.pageUrl;
    if (!url) return;

    const title = isLinkClick ? url : (tab?.title || url);
    await saveLinkFromContextMenu(url, title);
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "save-current-tab") return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    await saveLinkFromContextMenu(tab.url, tab.title || tab.url);
});

// ---- Auto-backup ----
// Writes a full JSON export to Downloads/link-saver-backups/ on a rolling
// weekly schedule, and keeps only the most recent MAX_BACKUPS copies —
// deleting the oldest file from disk each time a new one is added, so this
// folder never grows unbounded.
const BACKUP_INTERVAL_DAYS = 7;
const MAX_BACKUPS = 5;

chrome.alarms.create("link-saver-backup-check", { delayInMinutes: 60, periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "link-saver-backup-check") {
        maybeRunBackup();
    }
});

async function maybeRunBackup() {
    const { lastBackupAt = 0 } = await chrome.storage.local.get(["lastBackupAt"]);
    const dueAt = lastBackupAt + BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() >= dueAt) {
        await runBackup();
    }
}

async function runBackup() {
    try {
        const { leads = [], categories = [] } = await chrome.storage.local.get(["leads", "categories"]);
        const payload = JSON.stringify({ leads, categories, exportedAt: Date.now() }, null, 2);
        const dataUrl = "data:application/json;charset=utf-8," + encodeURIComponent(payload);

        const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const filename = `link-saver-backups/link-saver-backup-${dateStr}.json`;

        const downloadId = await chrome.downloads.download({
            url: dataUrl,
            filename,
            conflictAction: "uniquify",
            saveAs: false
        });

        const { backupHistory = [] } = await chrome.storage.local.get(["backupHistory"]);
        backupHistory.push({ id: downloadId, filename, timestamp: Date.now() });

        // Rotate: keep only the newest MAX_BACKUPS, delete the rest from disk.
        while (backupHistory.length > MAX_BACKUPS) {
            const old = backupHistory.shift();
            try {
                await chrome.downloads.removeFile(old.id);
            } catch (e) {
                // File may already be gone (user moved/deleted it) — safe to ignore.
            }
            try {
                await chrome.downloads.erase({ id: old.id });
            } catch (e) {
                // Ignore — just cleaning up the downloads list entry.
            }
        }

        await chrome.storage.local.set({ backupHistory, lastBackupAt: Date.now() });
    } catch (err) {
        console.error("Auto-backup failed:", err);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function saveLinkFromContextMenu(url, title) {
    const stored = await chrome.storage.local.get(["leads", "categories", "syncEnabled"]);
    const leads = stored.leads || [];
    const categories = stored.categories && stored.categories.length ? stored.categories : DEFAULT_CATEGORIES.slice();

    const isDuplicate = leads.some(lead =>
        (typeof lead === "object" && lead !== null && (lead.url === url || lead.originalUrl === url)) ||
        (typeof lead === "string" && lead === url)
    );
    if (isDuplicate) {
        notifyUser("Already saved", "This link is already in Link Saver.");
        return;
    }

    const result = await categorizeLeadShared(title, url, categories, { allowAI: true });
    if (result.newCategory && !categories.includes(result.newCategory)) {
        categories.push(result.newCategory);
    }

    leads.push({
        id: generateId(),
        url,
        title: title || url,
        originalUrl: url,
        category: result.category,
        addedAt: Date.now()
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
            message
        });
    }
}