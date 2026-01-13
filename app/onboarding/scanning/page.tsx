"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Youtube } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

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

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"queued" | "running" | "complete" | "failed">("queued");
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

  useEffect(() => {
    if (errorParam) {
      setError(errorParam);
      setStatus("failed");
      return;
    }

    if (!jobId) {
      setError("No scan job ID provided");
      setStatus("failed");
      return;
    }

    // Start polling immediately

    // Poll scan status every 1 second
    const pollInterval = setInterval(async () => {
      try {
        // Get current user for userId (required for scan status endpoint)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        const userId = user?.id;
        
        if (!userId) {
          console.warn("No user ID available - waiting for auth");
          return; // Skip this poll, try again next time
        }
        
        const url = `/api/scan/status?job=${jobId}&userId=${userId}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || "Failed to fetch scan status");
        }

        const data = await response.json();
        setProgress(data.progress || 0);
        setStatus(data.status);
        setError(data.error || null);

        if (data.status === "complete") {
          clearInterval(pollInterval);
          // Redirect to main home route after a brief delay
          setTimeout(() => {
            router.push("/");
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
  }, [jobId, errorParam, router]);

  const handleTryAgain = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8">
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
  );
}

export default function ScanningPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ScanningPageContent />
    </Suspense>
  );
}

