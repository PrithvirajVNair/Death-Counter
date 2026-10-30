import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, AlertTriangle, Check, Copy, Key, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showToast } from './Toast';
import '../styles/auth.css';

export default function RegenerateKeyModal({ isOpen, onClose }) {
  const { user, streamerKey, regenerateKey } = useAuth();
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleRegenerate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const generatedKey = await regenerateKey();
      if (generatedKey) {
        setNewKey(generatedKey);
        showToast('Streamer Key regenerated successfully!');
      }
    } catch (err) {
      showToast(`Failed to regenerate key: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNewKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    showToast('New Streamer Key copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setNewKey(null);
    setCopied(false);
    onClose();
  };

  const modalNode = (
    <div
      className="auth-modal-overlay"
      onClick={handleClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        backgroundColor: 'rgba(8, 9, 7, 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="auth-modal-card"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#141511',
          border: '1px solid rgba(200, 166, 93, 0.4)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 35px rgba(200, 166, 93, 0.15)',
          borderRadius: '8px',
          padding: '28px 24px',
          position: 'relative',
          color: '#e5dec9',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="auth-modal-close"
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#a89f8c',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(200, 166, 93, 0.12)',
              border: '1px solid rgba(200, 166, 93, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={18} color="#C8A65D" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#f3ede0', fontFamily: "'Cinzel', serif" }}>
              Regenerate Streamer Key
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#a89f8c' }}>
              Create a fresh secret key to connect your OBS browser overlay
            </p>
          </div>
        </div>

        {!newKey ? (
          <div>
            {/* Warning Alert Box */}
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', lineHeight: '1.5', color: '#fca5a5' }}>
                <strong style={{ color: '#fecaca', display: 'block', marginBottom: '4px' }}>
                  Important Security Notice
                </strong>
                Regenerating your key will immediately invalidate your previous key.
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  <li>Your OBS browser source overlays will need the new URL.</li>
                  <li><strong>Your death counts, boss records, and settings remain 100% safe.</strong></li>
                </ul>
              </div>
            </div>

            {/* Current Key Display */}
            <div
              style={{
                background: '#0d0e0b',
                border: '1px solid rgba(200, 166, 93, 0.2)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '20px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#a89f8c' }}>Current Key:</span>
              <span style={{ fontFamily: 'monospace', color: '#C8A65D', fontWeight: 600 }}>
                {streamerKey}
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleRegenerate}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Regenerating...' : 'Confirm: Regenerate Key'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Success Box */}
            <div
              style={{
                background: 'rgba(74, 222, 128, 0.08)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <ShieldCheck size={20} color="#4ade80" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '12.5px', color: '#86efac', lineHeight: '1.4' }}>
                <strong>New Streamer Key Active!</strong>
                <div style={{ fontSize: '11.5px', color: '#dcfce7', marginTop: '2px' }}>
                  Your old key has been revoked. Copy your new key below:
                </div>
              </div>
            </div>

            {/* New Key Display Box */}
            <div
              style={{
                background: '#0a0b08',
                border: '1px solid rgba(200, 166, 93, 0.4)',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <Key size={14} color="#C8A65D" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: '#fef08a',
                    fontWeight: 700,
                    wordBreak: 'break-all',
                  }}
                >
                  {newKey}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--primary btn--xs"
                onClick={handleCopyNewKey}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : null;
}
