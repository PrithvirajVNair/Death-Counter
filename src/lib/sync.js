// Multi-layer synchronization:
// 1. Server-Sent Events (SSE) via /api/events (for OBS Studio CEF, cross-browser, and cross-device sync)
// 2. BroadcastChannel (for instant 0ms local sync across same-browser tabs)
// 3. LocalStorage storage event fallback
// 4. REST endpoint POST /api/state for broadcasting to the server

import { SYNC_CHANNEL_NAME } from './defaults';

let channel = null;
let messageId = 0;
const processedIds = new Set();
const MAX_PROCESSED_IDS = 1000;

function getChannel() {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    }
  } catch (e) {
    console.warn('BroadcastChannel not available:', e);
  }
  return channel;
}

function generateMessageId() {
  return `${Date.now()}-${++messageId}-${Math.random().toString(36).slice(2, 8)}`;
}

function markProcessed(id) {
  if (!id) return;
  processedIds.add(id);
  if (processedIds.size > MAX_PROCESSED_IDS) {
    const arr = [...processedIds];
    arr.slice(0, arr.length - MAX_PROCESSED_IDS / 2).forEach((v) => processedIds.delete(v));
  }
}

export const LOCAL_APP_URL = 'http://127.0.0.1:4455';
let localAppActive = false;
let lastLocalCheckTime = 0;

export async function checkLocalApp() {
  const now = Date.now();
  if (localAppActive && now - lastLocalCheckTime < 2500) return true;
  if (!localAppActive && now - lastLocalCheckTime < 1200) return false;

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), 350);
    const res = await fetch(`${LOCAL_APP_URL}/api/state?_t=${now}`, {
      signal: controller?.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (res.ok) {
      localAppActive = true;
      lastLocalCheckTime = now;
      return true;
    }
  } catch {}
  localAppActive = false;
  lastLocalCheckTime = now;
  return false;
}

/**
 * Broadcast state update across all channels:
 * - Local companion app (http://127.0.0.1:4455)
 * - Local BroadcastChannel (immediate)
 * - LocalStorage event (fallback)
 * - Private channel (cloud) if specified
 */
export function broadcastUpdate(type, payload) {
  const id = generateMessageId();
  const message = { id, type, payload, timestamp: Date.now() };
  markProcessed(id);

  // 1. BroadcastChannel (same browser tab-to-tab, 0ms latency)
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage(message);
    } catch (e) {
      console.warn('BroadcastChannel postMessage failed:', e);
    }
  }

  // 2. LocalStorage event (fallback for same browser)
  try {
    const eventKey = `__sync_event_${SYNC_CHANNEL_NAME}`;
    localStorage.setItem(eventKey, JSON.stringify(message));
    setTimeout(() => {
      try { localStorage.removeItem(eventKey); } catch {}
    }, 100);
  } catch {}

  // 3. Direct local connection: If companion app is running, send directly to local PC server!
  if (localAppActive) {
    try {
      fetch(`${LOCAL_APP_URL}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, ...payload }),
      }).catch(() => {});
      return;
    } catch {}
  }

  // 4. Remote Cloud sync: ONLY if a private channel/room/streamerKey is explicitly specified
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const channel = params.get('key') || params.get('channel') || params.get('streamerKey') || params.get('room');
    if (channel) {
      try {
        const apiPayload = {
          type,
          channel,
          key: channel,
          ...payload,
          triggerAnim: payload?.triggerAnim || false,
          lastUpdated: payload?.lastUpdated || Date.now(),
        };
        fetch(`/api/state?key=${encodeURIComponent(channel)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiPayload),
        }).catch(() => {});
      } catch {}
    }
  }
}

/**
 * Fetch authoritative state directly from local desktop app or private channel
 */
export async function fetchServerState() {
  // 1. Direct local companion app connection (0ms latency, private to this PC)
  const isLocal = await checkLocalApp();
  if (isLocal) {
    try {
      const res = await fetch(`${LOCAL_APP_URL}/api/state?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated !== false) {
          return data;
        }
      }
    } catch {}
  }

  // 2. Cloud Server Sync: ONLY if a specific channel/key is requested in URL
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const channel = params.get('key') || params.get('channel') || params.get('streamerKey') || params.get('room');
    if (channel) {
      try {
        const res = await fetch(`/api/state?key=${encodeURIComponent(channel)}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (res.ok) {
          return await res.json();
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Subscribe to sync messages from ALL sources:
 * - Server-Sent Events (SSE) (critical for OBS Browser Source)
 * - BroadcastChannel
 * - LocalStorage 'storage' event
 * - Periodic fallback polling
 */
export function onSyncMessage(callback) {
  const cleanups = [];

  // ─── 1. Server-Sent Events (SSE) for OBS Studio Browser Source ───
  let eventSource = null;
  if (typeof EventSource !== 'undefined') {
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && msg.id && !processedIds.has(msg.id)) {
            markProcessed(msg.id);
            callback(msg);
          }
        } catch (err) {
          console.warn('[SSE] Parse error:', err);
        }
      };

      eventSource.onerror = () => {
        // EventSource automatically attempts reconnection
      };

      cleanups.push(() => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      });
    } catch (err) {
      console.warn('[SSE] EventSource init failed:', err);
    }
  }

  // ─── 2. BroadcastChannel (same browser tab-to-tab) ───
  const ch = getChannel();
  if (ch) {
    const channelHandler = (event) => {
      const msg = event.data;
      if (msg && msg.id && !processedIds.has(msg.id)) {
        markProcessed(msg.id);
        callback(msg);
      }
    };
    ch.addEventListener('message', channelHandler);
    cleanups.push(() => ch.removeEventListener('message', channelHandler));
  }

  // ─── 3. LocalStorage storage event fallback ───
  const storageHandler = (event) => {
    const eventKey = `__sync_event_${SYNC_CHANNEL_NAME}`;
    if (event.key !== eventKey || !event.newValue) return;
    try {
      const msg = JSON.parse(event.newValue);
      if (msg && msg.id && !processedIds.has(msg.id)) {
        markProcessed(msg.id);
        callback(msg);
      }
    } catch {}
  };
  window.addEventListener('storage', storageHandler);
  cleanups.push(() => window.removeEventListener('storage', storageHandler));

  // ─── 4. Periodic polling safety net ───
  // OBS Studio Browser Source runs on /overlay and polls frequently (800ms) for instant display.
  // The Controller page polls at 1200ms to safely sync desktop companion app hotkey actions.
  const isOverlayPage = typeof window !== 'undefined' && window.location.pathname.includes('overlay');
  const pollRate = isOverlayPage ? 800 : 1200;

  const pollInterval = setInterval(async () => {
    const serverState = await fetchServerState();
    if (serverState) {
      callback({
        id: `poll-${Date.now()}`,
        type: 'pollSync',
        payload: serverState,
        timestamp: Date.now(),
      });
    }
  }, pollRate);
  cleanups.push(() => clearInterval(pollInterval));

  return () => {
    cleanups.forEach((cleanup) => {
      try { cleanup(); } catch {}
    });
  };
}

export function isBroadcastChannelSupported() {
  return typeof BroadcastChannel !== 'undefined';
}

export function isEventSourceSupported() {
  return typeof EventSource !== 'undefined';
}
