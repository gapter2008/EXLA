"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";

// Simple layout components
const Screen = ({ children, scroll = true, className = "" }: { children: React.ReactNode; scroll?: boolean; className?: string }) => {
  return (
    <div className={`h-full w-full overflow-x-hidden ${scroll ? 'overflow-y-auto overscroll-contain no-scrollbar' : 'overflow-hidden'} ${className}`}>
      {children}
    </div>
  );
};

const Container = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  return (
    <div className={`w-full max-w-[360px] mx-auto px-5 box-border overflow-x-hidden ${className}`}>
      {children}
    </div>
  );
};

const PrimaryButton = ({ children, onClick, fullWidth = false, disabled = false, className = "" }: { children: React.ReactNode; onClick?: () => void; fullWidth?: boolean; disabled?: boolean; className?: string }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const SecondaryButton = ({ children, onClick, fullWidth = false, disabled = false, className = "" }: { children: React.ReactNode; onClick?: () => void; fullWidth?: boolean; disabled?: boolean; className?: string }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 text-sm font-semibold rounded-xl border-2 border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

// Error code messages
const ERROR_MESSAGES: Record<string, string> = {
  TT_CALLBACK_NO_CODE: "Authorization code not received from TikTok",
  TT_CALLBACK_NO_STATE: "State parameter missing (security check failed)",
  TT_STATE_MISMATCH: "State mismatch (possible CSRF attack)",
  TT_NO_VERIFIER: "PKCE verification failed (security check)",
  TT_NO_USER_ID: "User ID missing from authorization state",
  TT_EXCHANGE_FAILED: "Failed to exchange authorization code for access token",
  TT_EXCHANGE_401: "TikTok client credentials are incorrect. Please verify TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in your .env.local file match your TikTok Developer Portal settings, then restart your dev server.",
  TT_EXCHANGE_403: "TikTok API access denied (app may need review)",
  TT_NO_ACCESS_TOKEN: "No access token received from TikTok",
  TT_STORE_FAILED: "Failed to save connection to database",
  TT_OAUTH_ERROR: "TikTok returned an error during authorization",
  TT_NO_REDIRECT_URI: "Redirect URI not configured",
  TT_NO_CREDENTIALS: "TikTok API credentials not configured",
  TT_CALLBACK_EXCEPTION: "Unexpected error during callback",
};

export default function TikTokResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const status = searchParams.get("status");
  const reason = searchParams.get("reason");
  const error = searchParams.get("error");
  const details = searchParams.get("details");
  const checks = searchParams.get("checks");

  const isSuccess = status === "success";
  let errorMessage = reason ? ERROR_MESSAGES[reason] || `Error: ${reason}` : error || "Unknown error";
  
  // If we have specific error details, use them (especially for invalid_client)
  if (details && reason === 'TT_EXCHANGE_401') {
    errorMessage = details;
  }
  
  // Parse failure checks if present
  const failureChecks = checks ? checks.split('; ') : [];

  useEffect(() => {
    // If success, refresh router and trigger a page reload to ensure connection state updates
    if (isSuccess) {
      // Small delay to ensure Supabase write has completed
      setTimeout(() => {
        router.refresh();
        // Also trigger a full page reload to ensure all components refresh
        window.location.href = '/';
      }, 500);
    }
  }, [isSuccess, router]);

  const handleTryAgain = async () => {
    setIsRefreshing(true);
    
    // Get userId from Supabase auth or URL params
    let userId = searchParams.get("userId");
    if (!userId) {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
      } catch (err) {
        console.error('Failed to get user:', err);
      }
    }
    
    if (userId) {
      router.push(`/api/oauth/tiktok/start?userId=${userId}`);
    } else {
      router.push('/auth/login');
    }
  };

  const handleBackToProfile = () => {
    router.push("/");
  };

  return (
    <Screen scroll={false}>
      <Container>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
          {isSuccess ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-900">TikTok Connected!</h1>
                <p className="text-gray-600">
                  Your TikTok account has been successfully connected to Exla.
                </p>
              </div>
              <PrimaryButton onClick={handleBackToProfile} fullWidth>
                Back to Home
              </PrimaryButton>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-gray-900">Connection Failed</h1>
                <p className="text-gray-600 max-w-md text-sm leading-relaxed">{errorMessage}</p>
                {reason && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-left">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Error code:</p>
                    <p className="text-xs text-gray-600 font-mono">{reason}</p>
                    {error && error !== 'unknown' && (
                      <>
                        <p className="text-xs font-semibold text-gray-700 mt-2 mb-1">TikTok error:</p>
                        <p className="text-xs text-gray-600">{error}</p>
                      </>
                    )}
                    {reason === 'TT_EXCHANGE_401' && (
                      <div className="mt-3 pt-3 border-t border-gray-300 space-y-3">
                        {failureChecks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 mb-2">Specific issues detected:</p>
                            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                              {failureChecks.map((check, idx) => (
                                <li key={idx}>{check}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">How to fix:</p>
                          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                            <li>Open TikTok Developer Portal: <a href="https://developers.tiktok.com/apps" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">developers.tiktok.com/apps</a></li>
                            <li>Select your app → Basic Information</li>
                            <li>Copy the Client Key and Client Secret</li>
                            <li>Verify Redirect URL in Platform Information matches <code className="bg-gray-200 px-1 rounded">TIKTOK_REDIRECT_URI</code> exactly</li>
                            <li>Update your <code className="bg-gray-200 px-1 rounded">.env.local</code> file:
                              <br /><code className="text-xs bg-gray-200 px-1 rounded block mt-1">TIKTOK_CLIENT_KEY=your_key_here<br />TIKTOK_CLIENT_SECRET=your_secret_here<br />TIKTOK_REDIRECT_URI=https://your-url.com/api/oauth/tiktok/callback</code>
                            </li>
                            <li>Ensure no extra quotes or whitespace around values in <code className="bg-gray-200 px-1 rounded">.env.local</code></li>
                            <li>Restart your dev server: <code className="bg-gray-200 px-1 rounded">npm run dev</code></li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <PrimaryButton
                  onClick={handleTryAgain}
                  disabled={isRefreshing}
                  fullWidth
                >
                  {isRefreshing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin inline" />
                      Connecting...
                    </>
                  ) : (
                    "Try Again"
                  )}
                </PrimaryButton>
                <SecondaryButton onClick={handleBackToProfile} fullWidth>
                  Back to Profile
                </SecondaryButton>
              </div>
            </>
          )}
        </div>
      </Container>
    </Screen>
  );
}

