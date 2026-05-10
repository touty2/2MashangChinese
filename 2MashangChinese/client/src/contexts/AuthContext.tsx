import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { hydrateFromServer, performSync, shouldSync } from "@/lib/syncService";
import { clearAllCards } from "@/lib/flashcardStore";
import { clearAllDecks } from "@/lib/deckStore";
import { pruneOldSessions, clearUserSessions } from "@/lib/sessionStore";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  hydrating: boolean;
  isAuthenticated: boolean;
  refetch: () => void;
  onSyncComplete: (cb: () => void) => () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  hydrating: true,
  isAuthenticated: false,
  refetch: () => {},
  onSyncComplete: () => () => {},
});

async function clearLocalUserData(userEmail?: string): Promise<void> {
  await clearAllCards();
  await clearAllDecks();
  await pruneOldSessions();
  if (userEmail) await clearUserSessions(userEmail);
  const keysToRemove = [
    "mashang_completed", "mashang_my_words",
    "mashang_vocab_ignored", "mashang_seg_overrides",
  ];
  for (const key of keysToRemove) localStorage.removeItem(key);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const user = data ?? null;
  const prevUserRef = useRef<{ id: number | null; email: string | null } | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncCallbacksRef = useRef<Set<() => void>>(new Set());
  const [hydrating, setHydrating] = useState(true);

  const onSyncComplete = useCallback((cb: () => void) => {
    syncCallbacksRef.current.add(cb);
    return () => syncCallbacksRef.current.delete(cb);
  }, []);

  const notifySync = useCallback(() => {
    syncCallbacksRef.current.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
  }, []);

  const runSync = useCallback(() => {
    performSync(utils).then(notifySync).catch(console.error);
  }, [utils, notifySync]);

  useEffect(() => {
    if (isLoading) return;

    const currentUserId = user?.id ?? null;
    const currentEmail = user?.email ?? null;
    const prevUserId = prevUserRef.current?.id;
    const prevEmail = prevUserRef.current?.email ?? undefined;

    const isFirstLoad = prevUserRef.current === undefined;
    const isNewUser = currentUserId !== null && currentUserId !== prevUserId;
    const isSignOut = !isFirstLoad && prevUserId !== null && currentUserId === null;

    if (isNewUser || (isFirstLoad && currentUserId !== null)) {
      const emailToClear = isNewUser && prevUserId !== null ? (prevEmail ?? undefined) : undefined;
      setHydrating(true);
      clearLocalUserData(emailToClear)
        .then(() => hydrateFromServer(utils))
        .then(notifySync)  // tell Dashboard/Deck to reload after hydration
        .catch(console.error)
        .finally(() => setHydrating(false));
    } else if (isSignOut) {
      setHydrating(true);
      clearLocalUserData(prevEmail).catch(console.error).finally(() => setHydrating(false));
    } else if (isFirstLoad && currentUserId === null) {
      setHydrating(false);
    }

    prevUserRef.current = { id: currentUserId, email: currentEmail };
  }, [user?.id, user?.email, isLoading, utils, notifySync]);

  // Periodic sync every 3 minutes
  useEffect(() => {
    if (!user) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => { if (shouldSync()) runSync(); }, 60 * 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [user, runSync]);

  // Sync when user returns to the tab — the main fix for stale numbers
  useEffect(() => {
    if (!user) return;
    const handler = () => { if (document.visibilityState === "visible" && shouldSync()) runSync(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [user, runSync]);

  // Best-effort sync on tab close
  useEffect(() => {
    if (!user) return;
    const handler = () => { performSync(utils).catch(() => {}); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [user, utils]);

  return (
    <AuthContext.Provider value={{ user, loading: isLoading, hydrating: isLoading || hydrating, isAuthenticated: !!user, refetch, onSyncComplete }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
