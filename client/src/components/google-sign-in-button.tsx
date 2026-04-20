import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ensureGoogleIdentityScript, useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function GoogleSignInButton({ className }: { className?: string }) {
    const { clientId, handleGoogleCredential, error } = useAuth();
    const buttonContainerRef = useRef<HTMLDivElement | null>(null);
    const [initializing, setInitializing] = useState(true);
    const [scriptError, setScriptError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function init() {
            if (!clientId) {
                setScriptError('Google client ID is not configured.');
                setInitializing(false);
                return;
            }

            try {
                await ensureGoogleIdentityScript();
                if (cancelled) return;

                const google = window.google;
                if (!google?.accounts?.id) {
                    throw new Error('Google Identity Services are unavailable.');
                }

                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: async (response: { credential?: string | null }) => {
                        if (!response.credential) {
                            setScriptError('Google did not return a credential.');
                            return;
                        }

                        try {
                            await handleGoogleCredential(response.credential);
                        } catch (err) {
                            console.error('Failed to handle Google credential', err);
                        }
                    },
                    ux_mode: 'popup',
                    auto_select: false,
                });

                if (buttonContainerRef.current) {
                    google.accounts.id.renderButton(buttonContainerRef.current, {
                        theme: 'outline',
                        type: 'standard',
                        size: 'large',
                        width: 280,
                    });
                }

                google.accounts.id.prompt();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not initialize Google login.';
                setScriptError(message);
                console.error('Google sign-in initialization failed', err);
            } finally {
                if (!cancelled) {
                    setInitializing(false);
                }
            }
        }

        void init();

        return () => {
            cancelled = true;
        };
    }, [clientId, handleGoogleCredential]);

    const combinedError = scriptError ?? error;

    return (
        <div className={cn('flex flex-col items-center space-y-3', className)}>
            <div
                ref={buttonContainerRef}
                className={cn('transition-opacity', initializing ? 'opacity-0 pointer-events-none' : 'opacity-100')}
            />

            {initializing && (
                <Button variant="outline" disabled className="w-full justify-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Preparing Google login…
                </Button>
            )}

            {combinedError && (
                <p className="text-sm text-destructive text-center max-w-xs">
                    {combinedError}
                </p>
            )}
        </div>
    );
}
