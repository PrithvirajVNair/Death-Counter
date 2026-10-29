import React, { useState, useEffect } from 'react';

let toastIdCounter = 0;

// Global toast state (simple pub/sub)
const listeners = new Set();
let toasts = [];

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function showToast(message, type = 'success', duration = 3000) {
  const id = ++toastIdCounter;
  toasts = [...toasts, { id, message, type, duration }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

export default function ToastContainer() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => listeners.delete(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-container">
      {items.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast__message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
