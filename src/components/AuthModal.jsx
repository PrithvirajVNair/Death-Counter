import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Skull, AlertCircle, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import '../styles/auth.css';

export default function AuthModal({ isOpen, onClose }) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  if (!isOpen) return null;

  async function handleGoogleLogin() {
    try {
      setLoading(true);
      setErrorMsg('');
      await signInWithGoogle();
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      if (err.message && (err.message.includes('provider') || err.message.includes('not enabled') || err.message.includes('Unsupported'))) {
        setErrorMsg('Google OAuth is not enabled in your Supabase dashboard yet. You can sign in using Email below right now, or enable Google under Authentication -> Providers in Supabase.');
      } else {
        setErrorMsg(err.message || 'Google Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAuth(e) {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      setInfoMsg('');
      if (isSignUp) {
        await signUpWithEmail(email, password);
        setInfoMsg('Account created! If email confirmation is required, please check your inbox.');
      } else {
        await signInWithEmail(email, password);
        if (onClose) onClose();
      }
    } catch (err) {
      console.error('Auth Error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        {/* Souls Rune Decoration */}
        <div className="auth-emblem">
          <Skull size={32} color="#C8A65D" />
        </div>

        <h2 className="auth-title">Souls Chronicle</h2>
        <p className="auth-subtitle">Sign in to unlock your private death counter & OBS stream link</p>

        {errorMsg && (
          <div className="auth-alert auth-alert--error">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="auth-alert auth-alert--info">
            <ShieldCheck size={16} />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Primary Google Login Button */}
        <button
          type="button"
          className="btn-google"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{loading ? 'Connecting...' : 'Sign in with Google'}</span>
        </button>

        <div className="auth-divider">
          <span>or continue with email</span>
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} className="auth-form">
          <div className="auth-input-group">
            <Mail size={16} className="auth-input-icon" />
            <input
              type="email"
              placeholder="Streamer Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="auth-input"
            />
          </div>

          <div className="auth-input-group">
            <Lock size={16} className="auth-input-icon" />
            <input
              type="password"
              placeholder="Password (min. 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="auth-input"
            />
          </div>

          <button type="submit" className="btn-auth-submit" disabled={loading}>
            <span>{loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="auth-footer-toggle">
          {isSignUp ? (
            <span>
              Already have an account?{' '}
              <button type="button" onClick={() => setIsSignUp(false)} className="btn-link">
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Need a streamer account?{' '}
              <button type="button" onClick={() => setIsSignUp(true)} className="btn-link">
                Create Account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
