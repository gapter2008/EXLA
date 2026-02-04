"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { goOnboarding } from "@/lib/safeNavigate";
import { Loader2, Youtube } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useOnboarding } from "@/context/OnboardingContext";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";

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
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);

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

    // Reset UI when we have a valid job and no URL error (e.g. after Try Again)
    if (!errorParam) {
      setError(null);
      setStatus("queued");
      setProgress(0);
      setIsTimedOut(false);
    }
    setStartTime(Date.now());
    setIsTimedOut(false);

    // Start polling immediately

    // Poll scan status every 1.5 seconds (as requested)
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
          const msg = response.status === 404
            ? "Scan session expired or not found. Use Try Again to start a new scan."
            : (errorData.error || "Failed to fetch scan status");
          throw new Error(msg);
        }

        const data = await response.json();
        
        // Update progress - use real progress from scan_jobs, or 0 if not available
        const realProgress = typeof data.progress === 'number' ? data.progress : 0;
        setProgress(realProgress);
        
        // Update status - MUST come from scan_jobs
        const realStatus = data.status || "queued";
        setStatus(realStatus);
        setError(data.error || null);

        // Check for timeout: if status has been "running" for > 60s, show timeout UI
        if (realStatus === "running" && startTime) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          if (elapsedSeconds > 60) {
            setIsTimedOut(true);
            // Don't clear interval - keep polling in case it completes
          }
        } else if (realStatus !== "running") {
          // Reset timeout if status changed from running
          setIsTimedOut(false);
        }

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
          // Status is failed - stop polling and show error
          clearInterval(pollInterval);
          setIsTimedOut(false);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setError(err.message || "Failed to check scan status");
        setStatus("failed");
        clearInterval(pollInterval);
      }
    }, 1500); // Poll every 1.5 seconds as requested

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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center max-w-[280px]">
        <img 
          src="/brand/logo.png" 
          alt="Exla" 
          className="w-16 h-16 mb-12 opacity-60"
        />
        
        <h1 className="text-[24px] font-semibold text-[#0F172A] mb-2 text-center">
          Setting up your account
        </h1>
        
        <p className="text-[15px] text-[#64748B] text-center mb-16">
          This will just take a moment
        </p>

        <div className="w-full">
          <p className="text-[12px] text-[#64748B] uppercase tracking-[0.06em] mb-3 text-center">
            Building your creator profile
          </p>
          
          <div className="h-1 bg-[#F1F5F9] rounded-full overflow-hidden mb-4">
            <div 
              className="h-full bg-[#0F172A] transition-all duration-300 ease-out"
              style={{ width: `${progress > 0 ? progress : 0}%` }}
            />
          </div>
          
          <p className="text-[14px] text-[#0F172A] font-medium text-center">
            {status === "failed" ? (
              error || "Something went wrong during the scan"
            ) : isTimedOut && status === "running" ? (
              "Still working..."
            ) : (
              statusMessages[statusMessageIndex] || "Analyzing audience"
            )}
          </p>
        </div>

        {status === "failed" && (
          <div className="mt-8 w-full space-y-4">
            <Button onClick={handleTryAgain} variant="primary" className="w-full">
              Try Again
            </Button>
          </div>
        )}

        {isTimedOut && status === "running" && (
          <div className="mt-8 w-full space-y-4">
            <Button onClick={handleTryAgain} variant="secondary" className="w-full">
              Try Again
            </Button>
          </div>
        )}
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

