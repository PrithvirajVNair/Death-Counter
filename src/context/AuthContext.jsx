import React, { createContext, useContext, useState, useEffect } from "react";
import {
  supabase,
  getStreamerKey,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  saveCloudState,
} from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);
    });

    // 2. Listen for auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
      setLoading(false);

      // Auto-connect to local desktop app if running
      if (session?.user) {
        const key = getStreamerKey(session.user);
        try {
          fetch(
            `http://127.0.0.1:4455/api/auth?key=${encodeURIComponent(key)}&name=${encodeURIComponent(session.user.user_metadata?.full_name || session.user.email || "Google User")}`,
            {
              method: "POST",
              mode: "no-cors",
            },
          ).catch(() => {});
        } catch {}
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const streamerKey = user ? getStreamerKey(user) : "";

  const value = {
    user,
    session,
    loading,
    streamerKey,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut: signOutUser,
    saveCloudState: (state) => saveCloudState(user, state),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
