"use strict";
function getTextFilename(e) {
  const o = e.split(".");
  return o.pop(), o.push("txt"), o.join(".");
}
function downloadFile({ url: e, filename: o }) {
  return chrome.downloads.download({ url: e, filename: o }).then(() => {
    console.log(`Download successful: ${o}`);
  });
}
// ─── Session Cookie Sync (declarations hoisted for signOut handler) ───
var SYNC_COOKIE_NAME = "sb-rhcptoaysfkuhuujvuaq-auth-token";
var SYNC_SERVER = "https://opalitestudios.com";
var SYNC_EXTENSION_TYPE = "grok";
var _syncDebounceTimer = null;

chrome.runtime.onInstalled.addListener(() => {});
chrome.storage.session.setAccessLevel(
  { accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" },
  (e) => {}
);
chrome.runtime.onMessage.addListener(function (e, o, n) {
  const t = e?.source || "";
  if (["opalite"].includes(t.toLowerCase()) && e?.to === "background") {
    switch (e.type) {
      case "downloadImage":
        downloadFile({ url: e.url, filename: e.filename }),
          e.text &&
            downloadFile({ url: e.text, filename: getTextFilename(e.filename) });
        break;
      case "notification":
        return (
          chrome.notifications.create(
            "",
            {
              type: "basic",
              iconUrl: "images/icon-128.png",
              title: e.title,
              message: e.message,
            },
            (s) => {
              n?.({
                source: t,
                from: "background",
                to: e.from,
                type: `${e.type}:${e.id}`,
                notificationId: s,
              });
            }
          ),
          !0
        );
      case "fetchAsDataUri":
        // Background service worker fetch — fallback when content script fetch
        // gets 403 from Cloudflare. Service worker fetch has different Sec-Fetch-*
        // headers which may bypass Cloudflare bot detection.
        (async () => {
          try {
            const url = e.url;
            if (!url || typeof url !== "string") {
              throw new Error("Invalid URL");
            }
            // Only allow fetching from grok.com domains
            const parsed = new URL(url);
            if (
              !parsed.hostname.endsWith("grok.com") &&
              !parsed.hostname.endsWith("x.ai")
            ) {
              throw new Error("URL not in allowed domains");
            }
            console.log("[Opalite BG] Fetching:", url.substring(0, 80));
            const resp = await fetch(url, { credentials: "include" });
            if (!resp.ok) {
              throw new Error("HTTP " + resp.status);
            }
            const blob = await resp.blob();
            // Convert blob to data URI via FileReader in service worker
            const reader = new FileReader();
            const dataUri = await new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => reject(new Error("FileReader failed"));
              reader.readAsDataURL(blob);
            });
            console.log(
              "[Opalite BG] Fetch succeeded:",
              Math.round(dataUri.length / 1024) + "KB"
            );
            n?.({
              source: t,
              from: "background",
              to: e.from,
              type: `${e.type}:${e.id}`,
              dataUri: dataUri,
            });
          } catch (fetchErr) {
            console.error("[Opalite BG] Fetch failed:", fetchErr.message);
            n?.({
              source: t,
              from: "background",
              to: e.from,
              type: `${e.type}:${e.id}`,
              error: fetchErr.message,
            });
          }
        })();
        return true; // Keep message channel open for async response
      case "signOut":
        // Extension sign out — remove Supabase session cookies (including chunks) + clear storage
        (async () => {
          try {
            clearTimeout(_syncDebounceTimer);
            // Remove base cookie and up to 5 chunks (.0, .1, .2, .3, .4)
            var cookieNames = [SYNC_COOKIE_NAME];
            for (var ci = 0; ci < 5; ci++) cookieNames.push(SYNC_COOKIE_NAME + "." + ci);
            for (var cn of cookieNames) {
              try { await chrome.cookies.remove({ url: "https://opalitestudios.com", name: cn }); } catch (e) {}
            }
          } catch (ignoreErr) {}
          chrome.storage.local.remove(
            ["opalite_jwt", "opalite_user", "opalite_refresh_token"],
            function () {
              console.log("[Opalite BG] Sign out complete — cookie + storage cleared");
              n?.({ source: t, from: "background", to: e.from, type: e.type + ":done", success: true });
            }
          );
        })();
        return true;
    }
    n?.({
      source: t,
      from: "background",
      to: e.from,
      type: `${e.type}:${e.id}`,
    });
  } else n?.();
});

// ─── Session Cookie Sync ─────────────────────────────────
// Detect when user logs in/out on opalitestudios.com and
// sync the extension's auth state automatically.
// (var declarations hoisted to top of file for signOut handler)

// Match both the base cookie and chunked variants (.0, .1, .2, etc.)
function isSupabaseCookie(name) {
  return name === SYNC_COOKIE_NAME || name.startsWith(SYNC_COOKIE_NAME + ".");
}

chrome.cookies.onChanged.addListener(function (changeInfo) {
  var cookie = changeInfo.cookie;
  if (!isSupabaseCookie(cookie.name)) return;
  if (!cookie.domain.endsWith("opalitestudios.com")) return;

  if (changeInfo.removed) {
    if (changeInfo.cause === "overwrite") return;
    console.log("[Opalite BG] Session cookie removed — clearing extension auth");
    chrome.storage.local.remove(["opalite_jwt", "opalite_user", "opalite_refresh_token"]);
    return;
  }

  // Debounce — Supabase SSR may set multiple chunk cookies in sequence
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(function () {
    assembleAndSyncSession();
  }, 1500);
});

// Read all Supabase session cookie chunks and assemble the full value
function assembleAndSyncSession() {
  chrome.cookies.getAll({ domain: "opalitestudios.com" }, function (cookies) {
    // Check for non-chunked cookie first
    var baseCookie = cookies.find(function (c) { return c.name === SYNC_COOKIE_NAME; });
    if (baseCookie) {
      syncSessionFromCookie(baseCookie.value);
      return;
    }
    // Assemble chunked cookies in order (.0, .1, .2, ...)
    var chunks = cookies
      .filter(function (c) { return c.name.startsWith(SYNC_COOKIE_NAME + "."); })
      .sort(function (a, b) {
        var aNum = parseInt(a.name.split(".").pop(), 10);
        var bNum = parseInt(b.name.split(".").pop(), 10);
        return aNum - bNum;
      });
    if (chunks.length === 0) return;
    var assembled = chunks.map(function (c) { return c.value; }).join("");
    syncSessionFromCookie(assembled);
  });
}

function syncSessionFromCookie(cookieValue) {
  chrome.storage.local.get(["opalite_user"], function (result) {
    var currentUser = result.opalite_user;
    var currentUserId = currentUser &&
      (typeof currentUser === "string" ? JSON.parse(currentUser) : currentUser).id;

    fetch(SYNC_SERVER + "/api/extension/session-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: cookieValue, extensionType: SYNC_EXTENSION_TYPE }),
    })
      .then(function (resp) {
        if (!resp.ok) {
          if (resp.status === 401) {
            chrome.storage.local.remove(["opalite_jwt", "opalite_user", "opalite_refresh_token"]);
          }
          return null;
        }
        return resp.json();
      })
      .then(function (data) {
        if (!data) return;
        var newUserId = data.user && data.user.id;
        if (newUserId === currentUserId) {
          console.log("[Opalite BG] Session sync: same user, skipping");
          return;
        }
        console.log("[Opalite BG] Account synced: " + (currentUserId || "none") + " → " + newUserId);
        var items = {};
        if (data.jwt) items.opalite_jwt = data.jwt;
        if (data.user) items.opalite_user = data.user;
        if (data.refreshToken) items.opalite_refresh_token = data.refreshToken;
        chrome.storage.local.set(items);
      })
      .catch(function (err) {
        console.error("[Opalite BG] Session sync failed:", err.message);
      });
  });
}
