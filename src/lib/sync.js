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

/**
 * Broadcast state update across all channels:
 * - Local BroadcastChannel (immediate)
 * - LocalStorage event (fallback)
 * - Server POST /api/state (reaches OBS Browser Source via SSE & persists to disk)
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

  // 3. Server HTTP POST -> broadcasts via SSE to OBS Browser Source and other devices
  try {
    const apiPayload = {
      type,
      ...payload,
      triggerAnim: payload?.triggerAnim || false,
    };
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    }).catch(() => {
      // Server might be in static preview or offline, local sync continues
    });
  } catch {}
}

/**
 * Fetch authoritative state directly from server
 */
export async function fetchServerState() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Silently fall back to storage
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

  // ─── 4. Periodic polling safety net (every 800ms for responsive OBS overlay sync) ───
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
  }, 800);
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
