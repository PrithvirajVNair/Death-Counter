import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Clock, Trash2, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createRemoteToken, fetchRemoteTokens, revokeRemoteToken } from '../lib/supabase';
import '../styles/auth.css';

const EXPIRY_OPTIONS = [
  { value: 1, label: '1 Hour (Single stream)' },
  { value: 3, label: '3 Hours' },
  { value: 6, label: '6 Hours (Recommended)' },
  { value: 12, label: '12 Hours' },
  { value: 24, label: '24 Hours (Full day)' },
  { value: 72, label: '3 Days' },
  { value: 168, label: '7 Days' },
  { value: 0, label: 'Never (Permanent link)' },
];

export default function ShareRemoteModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [label, setLabel] = useState('');
  const [durationHours, setDurationHours] = useState(6);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [latestLink, setLatestLink] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [copiedLatest, setCopiedLatest] = useState(false);

  const loadTokens = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await fetchRemoteTokens(user);
      setTokens(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load remote tokens:', err);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      loadTokens();
    }
  }, [isOpen, loadTokens]);

  if (!isOpen) return null;

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const tokenRecord = await createRemoteToken(user, {
        label: label.trim() || 'Friend Remote Access',
        durationHours: Number(durationHours),
      });

      const fullUrl = `${window.location.origin}/remote?token=${encodeURIComponent(tokenRecord.token)}`;
      setLatestLink(fullUrl);
      setLabel('');
      await loadTokens();
    } catch (err) {
      alert('Error creating remote link: ' + (err.message || 'Please try again'));
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (tokenObj) => {
    if (!confirm(`Revoke access for "${tokenObj.label || 'Friend'}"? Their link will stop working immediately.`)) {
      return;
    }
    await revokeRemoteToken(user, tokenObj.id || tokenObj.token);
    await loadTokens();
  };

  const formatExpiry = (expiresAt, isRevoked) => {
    if (isRevoked) return { text: 'Revoked', status: 'revoked' };
    if (!expiresAt) return { text: 'Permanent (No expiry)', status: 'permanent' };
    const dateObj = new Date(expiresAt);
    if (isNaN(dateObj.getTime())) return { text: 'Active', status: 'active' };
    const diff = dateObj.getTime() - Date.now();
    if (diff <= 0) return { text: 'Expired', status: 'expired' };

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.round(hours / 24);
      return { text: `Expires in ${days}d`, status: 'active' };
    }
    if (hours > 0) {
      return { text: `Expires in ${hours}h ${mins}m`, status: 'active' };
    }
    return { text: `Expires in ${mins}m`, status: 'warning' };
  };

  const modalNode = (
    <div
      className="auth-modal-overlay"
      onClick={onClose}
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
          maxWidth: '580px',
          maxHeight: '90vh',
          overflowY: 'auto',
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
        <button type="button" className="auth-modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="auth-modal-header" style={{ marginBottom: '1.2rem' }}>
          <div className="auth-modal-rune" style={{ margin: '0 auto 0.6rem' }}>
            <Link2 size={24} color="#C8A65D" />
          </div>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.3rem' }}>Friend Remote Link</h2>
          <p style={{ fontSize: '0.82rem', color: '#a09985' }}>
            Share a link with a friend or moderator so they can update your death & boss counts live while you play.
          </p>
        </div>

        {/* Generator Form */}
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.4rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: '#c8a65d', display: 'block', marginBottom: '0.3rem' }}>
                Friend / Label Name:
              </label>
              <input
                type="text"
                className="auth-input"
                placeholder="e.g. Friend Alex"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={40}
                style={{ padding: '0.55rem 0.8rem', fontSize: '0.85rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', color: '#c8a65d', display: 'block', marginBottom: '0.3rem' }}>
                Link Expiration:
              </label>
              <select
                className="auth-input"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                style={{ padding: '0.55rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ background: '#1c1c18', color: '#e5dec9' }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
            style={{ padding: '0.65rem 1rem', fontSize: '0.9rem' }}
          >
            {loading ? 'Generating Link...' : '✦ Generate Friend Remote Link'}
          </button>
        </form>

        {/* Newly Generated Link Highlight */}
        {latestLink && (
          <div
            style={{
              padding: '0.85rem',
              background: 'rgba(200, 166, 93, 0.08)',
              border: '1px solid rgba(200, 166, 93, 0.4)',
              borderRadius: '6px',
              marginBottom: '1.4rem',
            }}
          >
            <div style={{ fontSize: '0.76rem', color: '#4ade80', fontWeight: 'bold', marginBottom: '0.3rem' }}>
              ✓ Remote Link Ready to Share:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={latestLink}
                className="auth-input"
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem', color: '#c8a65d' }}
                onClick={(e) => e.target.select()}
              />
              <button
                type="button"
                className="btn btn--sm btn--primary"
                style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                onClick={() => {
                  navigator.clipboard.writeText(latestLink);
                  setCopiedLatest(true);
                  setTimeout(() => setCopiedLatest(false), 2000);
                }}
              >
                {copiedLatest ? <Check size={14} /> : <Copy size={14} />} {copiedLatest ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Existing Tokens List */}
        <div>
          <div style={{ fontSize: '0.82rem', color: '#c8a65d', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={14} /> Active & Created Links ({tokens.length})
          </div>

          {tokens.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#888', fontStyle: 'italic', padding: '0.8rem', textAlign: 'center' }}>
              No remote links created yet. Generate one above to give a friend access!
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingRight: '0.2rem' }}>
              {tokens.map((t) => {
                const info = formatExpiry(t.expires_at, t.is_revoked);
                const fullUrl = `${window.location.origin}/remote?token=${encodeURIComponent(t.token)}`;
                const isCopied = copiedId === t.id;

                let statusBadgeColor = '#4ade80';
                if (info.status === 'revoked' || info.status === 'expired') statusBadgeColor = '#f87171';
                else if (info.status === 'warning') statusBadgeColor = '#fbbf24';

                return (
                  <div
                    key={t.id || t.token}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.55rem 0.8rem',
                      background: 'rgba(20, 21, 17, 0.7)',
                      border: '1px solid rgba(80, 75, 60, 0.3)',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ overflow: 'hidden', paddingRight: '0.5rem' }}>
                      <div style={{ fontWeight: 600, color: '#e5dec9', fontSize: '0.82rem' }}>
                        {t.label || 'Friend Remote'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: statusBadgeColor, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span>● {info.text}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      {!t.is_revoked && info.status !== 'expired' && (
                        <button
                          type="button"
                          className="btn btn--sm btn--secondary"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                          title="Copy Link"
                          onClick={() => {
                            navigator.clipboard.writeText(fullUrl);
                            setCopiedId(t.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {isCopied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                        </button>
                      )}

                      {!t.is_revoked && (
                        <button
                          type="button"
                          className="btn btn--sm"
                          style={{
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.75rem',
                            background: 'rgba(50, 20, 20, 0.6)',
                            color: '#f87171',
                            borderColor: '#7f1d1d',
                          }}
                          title="Revoke access"
                          onClick={() => handleRevoke(t)}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: '1.2rem', textAlign: 'center' }}>
          <button
            type="button"
            className="auth-switch-btn"
            style={{ fontSize: '0.78rem' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalNode, document.body)
    : modalNode;
}
