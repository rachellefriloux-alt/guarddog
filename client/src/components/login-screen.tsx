import { Cloud, ShieldCheck, Video } from 'lucide-react';
import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useState } from 'react';

export function LoginScreen() {
    const { clientId, refreshSession } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const handleDevLogin = async () => {
        setIsLoading(true);
        try {
            const response = await apiRequest('POST', '/api/auth/dev-login');
            if (response.ok) {
                await refreshSession();
            }
        } catch (error) {
            console.error('Dev login failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black p-6">
            <div className="w-full max-w-xl rounded-3xl bg-card shadow-2xl border border-border/60 backdrop-blur-xl">
                <div className="flex flex-col lg:flex-row">
                    <div className="flex-1 p-8 lg:p-10 flex flex-col gap-6 justify-center">
                        <div className="flex items-center gap-3 text-primary">
                            <ShieldCheck className="h-8 w-8" />
                            <h1 className="text-2xl font-semibold tracking-tight">GuardDog Surveillance</h1>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                            Sign in with your Google account to access live camera feeds, cloud backups, and AI-powered activity insights. Your login keeps GuardDog data secure and personalized to you.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground/90">
                            <div className="flex items-center gap-2">
                                <Video className="h-4 w-4 text-primary" />
                                <span>Real-time monitoring</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Cloud className="h-4 w-4 text-primary" />
                                <span>Automatic Drive backups</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 border-t lg:border-t-0 lg:border-l border-border/40 bg-muted/20 p-8 lg:p-10 flex flex-col items-center justify-center gap-6">
                        <div className="w-full flex flex-col items-center gap-4">
                            <h2 className="text-lg font-medium">Welcome back</h2>
                            {clientId ? (
                                <GoogleSignInButton className="w-full" />
                            ) : (
                                <div className="w-full flex flex-col items-center gap-4">
                                    <p className="text-sm text-muted-foreground text-center">
                                        Google login is not configured.
                                    </p>
                                    <Button 
                                        onClick={handleDevLogin}
                                        disabled={isLoading}
                                        className="w-full"
                                    >
                                        {isLoading ? 'Signing in...' : 'Continue as Dev User'}
                                    </Button>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                            GuardDog only uses your Google profile to authenticate you locally. We never store your Google password or share your account data.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
