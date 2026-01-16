"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { goOnboarding } from "@/lib/safeNavigate";
import { Loader2, Youtube } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useOnboarding } from "@/context/OnboardingContext";

// Button component (matching ExlaApp style)
const Button = ({ children, onClick, variant = 'primary', fullWidth, disabled, className = '' }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary'; fullWidth?: boolean; disabled?: boolean; className?: string }) => {
  const baseStyles = "px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98";
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-white border border-gray-300 text-gray-900 hover:bg-gray-50",
  };
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const statusMessages = [
  "Scanning your account",
  "Fetching profile and stats",
  "Analyzing content",
  "Building your profile",
  "Personalizing matches",
];

function ScanningPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const errorParam = searchParams.get("error");
  const { advanceStep } = useOnboarding();

  const [user, setUser] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"queued" | "running" | "complete" | "failed" | "scanned_partial">("queued");
  const [error, setError] = useState<string | null>(errorParam);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);

  // Start animation immediately on load
  useEffect(() => {
    // Rotate status messages every 2 seconds
    const messageInterval = setInterval(() => {
      setStatusMessageIndex((prev) => (prev + 1) % statusMessages.length);
    }, 2000);

    return () => clearInterval(messageInterval);
  }, []);

  // Get user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    if (!user) return; // Wait for user to load

    if (errorParam) {
      setError(errorParam);
      setStatus("failed");
      return;
    }

    // If no jobId, try to find latest scan job for user
    let effectiveJobId = jobId;
    
    if (!effectiveJobId) {
      // Try to find latest scan job
      (async () => {
        try {
          const response = await fetch(`/api/scan/status?userId=${user.id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.job_id) {
              effectiveJobId = data.job_id;
              // Update URL without navigation
              window.history.replaceState({}, '', `/onboarding/scanning?job=${effectiveJobId}`);
            }
          }
        } catch (err) {
          console.error('Failed to find scan job:', err);
        }
      })();
    }

    if (!effectiveJobId) {
      setError("No scan job found. Please start a scan.");
      setStatus("failed");
      return;
    }

    // Start polling immediately

    // Poll scan status every 1.5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const userId = user.id;
        
        if (!userId) {
          console.warn("No user ID available - waiting for auth");
          return; // Skip this poll, try again next time
        }
        
        const url = `/api/scan/status?job=${effectiveJobId || jobId}&userId=${userId}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || "Failed to fetch scan status");
        }

        const data = await response.json();
        setProgress(data.progress || 0);
        setStatus(data.status);
        setError(data.error || null);

        if (data.status === "complete" || data.status === "scanned_partial") {
          clearInterval(pollInterval);
          
          // Mark onboarding as complete and navigate to media kit
          try {
            const { supabase } = await import('@/lib/supabaseClient');
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Update onboarding status to completed - CRITICAL
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                  onboarding_completed: true,
                  onboarding_step: null,
                })
                .eq('id', user.id);
              
              if (updateError) {
                console.error('Failed to update onboarding status:', updateError);
                // Also try via context
                await advanceStep('complete');
                try {
                  await supabase
                    .from('profiles')
                    .update({ onboarding_completed: true })
                    .eq('id', user.id);
                } catch (retryErr) {
                  console.error('Retry update also failed:', retryErr);
                }
              } else {
                // Update context
                await advanceStep('complete');
              }
            }
          } catch (err) {
            console.error('Failed to update onboarding status:', err);
            // Still navigate even if update fails
          }
          
          // Navigate to home (media kit will be accessible from there)
          setTimeout(() => {
            router.replace("/");
          }, 1000);
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setError(err.message || "Failed to check scan status");
        setStatus("failed");
        clearInterval(pollInterval);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [user, jobId, errorParam, router, advanceStep]);

  const handleTryAgain = async () => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Please sign in to retry');
        return;
      }

      // Call scan start endpoint
      const response = await fetch('/api/scan/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to start scan');
      }

          const data = await response.json();
          if (data.scan_job_id) {
            // Navigate to new scan job
            goOnboarding(router, 'scanning', `job=${data.scan_job_id}`);
      } else {
        throw new Error('No scan job ID returned');
      }
    } catch (err: any) {
      console.error('[Retry Scan] Error:', err);
      alert(`Failed to retry scan: ${err.message || 'Please try again'}`);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <div className="space-y-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 rounded-full mb-6">
              <Youtube size={40} className="text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Scanning Your Account</h1>
            <p className="text-gray-600">This will just take a moment...</p>
          </div>

          {status === "failed" ? (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  {error || "Something went wrong during the scan"}
                </p>
              </div>
              <Button onClick={handleTryAgain} fullWidth>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{statusMessages[statusMessageIndex]}...</span>
                  <span className="font-medium text-gray-900">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Animated spinner */}
              <div className="flex justify-center">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
              </div>

              {status === "complete" && (
                <div className="text-center">
                  <p className="text-sm text-green-600 font-medium">✓ Scan complete!</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScanningPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="w-full max-w-sm px-6 pb-28 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <ScanningPageContent />
    </Suspense>
  );
}

