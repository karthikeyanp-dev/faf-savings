/**
 * FaF Savings Pool — Notification Service Worker Script
 *
 * This file is loaded via importScripts by the workbox-generated service worker.
 * It uses Firestore onSnapshot to detect new/changed transactions and shows
 * browser push notifications to viewer users.
 *
 * Firebase config is available as __FIREBASE_CONFIG__ (injected at build time).
 * Firebase compat SDKs are loaded before this script via importScripts.
 */

/* global firebase, self, indexedDB */

// ── IndexedDB helpers (duplicated for SW context — no module imports available) ────

const IDB_NAME = 'faf-savings-sw';
const IDB_VERSION = 1;
const IDB_STORE = 'state';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── State ──────────────────────────────────────────────────────────

let unsubscribe = null;       // Firestore listener unsubscribe function
let lastSeenTxId = null;      // Last transaction ID we've seen (avoid duplicates)
let listenerActive = false;   // Whether the Firestore listener is currently active

// ── Notification helpers ───────────────────────────────────────────

const TX_NOTIFICATIONS = {
  deposit:         { title: 'New Deposit',       emoji: '\u{1F4B0}' },
  withdrawal:      { title: 'Withdrawal Made',   emoji: '\u{1F4E4}' },
  return:          { title: 'Return Processed',   emoji: '\u{1F504}' },
  interest:        { title: 'Interest Added',     emoji: '\u{1F4C8}' },
  opening_balance: { title: 'Balance Updated',    emoji: '\u2696\uFE0F' },
};

function formatAmount(amount) {
  return '\u20B9' + amount.toLocaleString('en-IN');
}

async function getMemberName(memberId) {
  try {
    const db = firebase.firestore();
    const doc = await db.collection('members').doc(memberId).get();
    if (doc.exists) return doc.data().name;
  } catch (_) { /* ignore */ }
  return 'Unknown Member';
}

async function getUserPrefs() {
  // Read notification prefs from IndexedDB (synced by main thread)
  const prefs = await idbGet('notificationPrefs');
  if (!prefs) return null;
  return {
    enabled: prefs.enabled === true,
    deposit: prefs.deposit !== false,
    withdrawal: prefs.withdrawal !== false,
    return: prefs.return !== false,
    interest: prefs.interest !== false,
    opening_balance: prefs.opening_balance !== false,
  };
}

async function showTransactionNotification(tx) {
  // Don't show notifications when the app is in the foreground
  const appVisible = await idbGet('appVisible');
  if (appVisible !== false) return; // default true = don't notify if unknown

  const uid = await idbGet('uid');
  if (!uid) return;

  const prefs = await getUserPrefs();
  if (!prefs || !prefs.enabled) return;

  const txType = tx.type;
  if (!prefs[txType]) return;

  const config = TX_NOTIFICATIONS[txType] || TX_NOTIFICATIONS.deposit;
  const memberName = tx.memberId ? await getMemberName(tx.memberId) : 'Pool';
  const body = memberName + ' \u2014 ' + formatAmount(tx.amount);

  self.registration.showNotification(config.emoji + ' ' + config.title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'tx-' + tx.id,
    data: { url: '/activity' },
    vibrate: [100, 50, 100],
  });
}

// ── Firestore listener ─────────────────────────────────────────────

function startListener() {
  if (listenerActive) return;

  // Read Firebase config from IndexedDB (saved by main thread)
  idbGet('firebaseConfig').then(function(config) {
    if (!config) {
      console.warn('[SW] No Firebase config found in IndexedDB');
      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      var db = firebase.firestore();
      listenerActive = true;

      unsubscribe = db
        .collection('transactions')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .onSnapshot(
          function(snapshot) {
            if (snapshot.empty) return;

            var doc = snapshot.docs[0];
            var txId = doc.id;

            // Skip if we've already seen this transaction
            if (lastSeenTxId === txId) return;

            // On first load, just record the latest tx without notifying
            if (lastSeenTxId === null) {
              lastSeenTxId = txId;
              return;
            }

            lastSeenTxId = txId;
            var tx = Object.assign({ id: doc.id }, doc.data());

            // Only notify for active transactions
            if (tx.status === 'active') {
              showTransactionNotification(tx);
            }
          },
          function(error) {
            console.error('[SW] Firestore onSnapshot error:', error);
            listenerActive = false;
            // Retry after 30 seconds
            setTimeout(function() {
              if (!listenerActive) startListener();
            }, 30000);
          }
        );
    } catch (error) {
      console.error('[SW] Failed to start Firestore listener:', error);
      listenerActive = false;
    }
  });
}

function stopListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  listenerActive = false;
  lastSeenTxId = null;
}

// ── Lifecycle events ───────────────────────────────────────────────

self.addEventListener('activate', function(event) {
  // Start listener after activation if we have a stored UID
  event.waitUntil(
    idbGet('uid').then(function(uid) {
      if (uid) startListener();
    })
  );
});

// Listen for messages from the main thread
self.addEventListener('message', function(event) {
  // Validate message origin for security
  if (event.origin !== self.location.origin) return;

  var type = (event.data || {}).type;

  if (type === 'START_NOTIFICATIONS') {
    startListener();
  } else if (type === 'STOP_NOTIFICATIONS') {
    stopListener();
  }
});

// Handle notification click — open the app to the Activity page
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = (event.notification.data || {}).url || '/activity';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Focus existing window if one is open
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(self.location.origin) !== -1 && 'focus' in clients[i]) {
          clients[i].navigate(url);
          return clients[i].focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
