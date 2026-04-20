import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface AuthUser {
    id: string;
    email: string;
    name?: string | null;
    picture?: string | null;
}

interface AuthContextValue {
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    clientId: string | null;
    refreshSession: () => Promise<void>;
    handleGoogleCredential: (credential: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (window.google && window.google.accounts && window.google.accounts.id) {
        return Promise.resolve();
    }

    if (googleScriptPromise) {
        return googleScriptPromise;
    }

    googleScriptPromise = new Promise((resolve, reject) => {
        const existingScript = document.getElementById('google-identity-services');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Google Identity script failed to load.')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = 'google-identity-services';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Identity script failed to load.'));
        document.head.appendChild(script);
    });

    return googleScriptPromise;
}

declare global {
    interface Window {
        google?: any;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const clientId = useMemo(() => {
        const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
        return id ?? null;
    }, []);

    const refreshSession = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/auth/session', { credentials: 'include' });
            if (!res.ok) {
                setUser(null);
                setError(null);
                return;
            }

            const data = await res.json();
            if (data?.authenticated && data.user) {
                setUser(data.user);
                setError(null);
            } else {
                setUser(null);
            }
        } catch (err) {
            console.error('Failed to refresh auth session', err);
            setUser(null);
            setError('Unable to reach authentication service.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refreshSession();
    }, [refreshSession]);

    const handleGoogleCredential = useCallback(
        async (credential: string) => {
            try {
                if (!credential) {
                    throw new Error('Missing Google credential.');
                }

                const response = await apiRequest('POST', '/api/auth/google', { credential });
                const data = await response.json();
                if (data?.authenticated && data.user) {
                    setUser(data.user);
                    setError(null);
                } else {
                    throw new Error('Authentication failed.');
                }
            } catch (err) {
                console.error('Google login failed', err);
                const message = err instanceof Error ? err.message : 'Google login failed.';
                setError(message);
                throw err;
            }
        },
        []);

    const signOut = useCallback(async () => {
        try {
            await apiRequest('POST', '/api/auth/logout');
        } catch (err) {
            console.warn('Sign out request failed', err);
        } finally {
            setUser(null);
            setError(null);
        }
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            loading,
            error,
            clientId,
            refreshSession,
            handleGoogleCredential,
            signOut,
        }),
        [clientId, error, handleGoogleCredential, loading, refreshSession, signOut, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export async function ensureGoogleIdentityScript(): Promise<void> {
    await loadGoogleIdentityScript();
}
