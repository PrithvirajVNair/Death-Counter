import React, { createContext, useContext, useState, useEffect } from "react";
import {
  supabase,
  getStreamerKey,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  saveCloudState,
  saveCloudConfig,
  regenerateStreamerKey,
} from "../lib/supabase";
import { clearAllStorage } from "../lib/storage";

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

      if (!session?.user) {
        clearAllStorage();
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const streamerKey = user ? getStreamerKey(user) : "";

  const handleSignOut = async () => {
    clearAllStorage();
    await signOutUser();
    window.location.reload();
  };

  const handleRegenerateKey = async () => {
    if (!user) return null;
    const newKey = await regenerateStreamerKey(user);
    if (newKey) {
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (freshUser) {
        setUser(freshUser);
      }
    }
    return newKey;
  };

  const value = {
    user,
    session,
    loading,
    streamerKey,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut: handleSignOut,
    regenerateKey: handleRegenerateKey,
    saveCloudState: (state) => saveCloudState(user, state),
    saveCloudConfig: (config) => saveCloudConfig(user, config),
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
