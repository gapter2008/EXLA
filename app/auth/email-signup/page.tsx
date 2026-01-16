"use client";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { goOnboarding } from "@/lib/safeNavigate";
import { useState } from "react";

// Client-side helper to get app URL
function getAppUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000'; // Server-side fallback
  }
  
  // Check for explicit app URL env var (available in production via Next.js)
  // In client-side, we use window.location.origin
  return window.location.origin;
}

export default function EmailSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    // Validate inputs
    if (!email || !password) {
      setError("Please fill in all required fields");
      return;
    }
    
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password, 
        options: { 
          emailRedirectTo: `${getAppUrl()}/`,
        } 
      });
      
      if (error) {
        console.error("Signup error:", error);
        console.error("Error details:", {
          message: error.message,
          name: error.name,
          status: (error as any).status,
        });
        
        // Provide more helpful error messages
        if (error.message?.includes("fetch") || error.message?.includes("Failed to fetch")) {
          setError("Network error. Please verify your Supabase URL is correct and your dev server was restarted after adding .env.local");
        } else if (error.message?.includes("Supabase environment variables")) {
          setError("Supabase is not configured. Please check your .env.local file and restart the dev server.");
        } else if (error.message?.includes("already registered") || error.message?.includes("already been registered")) {
          setError("An account with this email already exists. Please log in instead.");
        } else if (error.message?.includes("Invalid API key")) {
          setError("Invalid Supabase API key. Please check your NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
        } else if (error.message?.includes("Invalid URL")) {
          setError("Invalid Supabase URL. Please check your NEXT_PUBLIC_SUPABASE_URL in .env.local");
        } else {
          setError(error.message || "Failed to create account. Please try again.");
        }
        setIsLoading(false);
        return;
      }
      
      if (data?.user) {
        // Check if email confirmation is required
        if (data.user.email_confirmed_at) {
          // Read onboarding data from localStorage
          const onboardingDataStr = localStorage.getItem('exla_onboarding');
          
          if (onboardingDataStr) {
            try {
              const onboardingData = JSON.parse(onboardingDataStr);
              
              // Upsert into Supabase profiles table
              // User already completed profile step, so go to connect step
              // DO NOT include email - column does not exist in profiles table
              const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                  id: data.user.id,
                  name: onboardingData.name || null,
                  primary_platform: onboardingData.primary_platform || null,
                  onboarding_step: 'connect', // Next step after profile
                  onboarding_completed: false,
                }, {
                  onConflict: 'id'
                });

              if (profileError) {
                console.error('Error saving onboarding data:', profileError);
                // Still redirect even if profile save fails
              } else {
                // Clear localStorage after successful save
                localStorage.removeItem('exla_onboarding');
              }
              
              // Small delay to ensure profile is saved before redirect
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Redirect to connect step (user already filled profile)
              goOnboarding(router, 'connect');
              // Don't call router.refresh() here - it can cause race conditions
            } catch (parseErr) {
              console.error('Error parsing onboarding data:', parseErr);
              // Set onboarding_completed = false explicitly, start from welcome
              // DO NOT include email - column does not exist in profiles table
              await supabase
                .from('profiles')
                .upsert({
                  id: data.user.id,
                  onboarding_step: 'welcome',
                  onboarding_completed: false,
                }, {
                  onConflict: 'id'
                });
              // Small delay to ensure profile is saved
              await new Promise(resolve => setTimeout(resolve, 100));
              goOnboarding(router, 'welcome');
            }
          } else {
            // No onboarding data, start from welcome
            // Set onboarding_completed = false explicitly
            // DO NOT include email - column does not exist in profiles table
            await supabase
              .from('profiles')
              .upsert({
                id: data.user.id,
                onboarding_step: 'welcome',
                onboarding_completed: false,
              }, {
                onConflict: 'id'
              });
            // Small delay to ensure profile is saved
            await new Promise(resolve => setTimeout(resolve, 100));
            goOnboarding(router, 'welcome');
          }
        } else {
          setError("Check your email to confirm your account!");
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      console.error("Signup exception:", err);
      setIsLoading(false);
      if (err.message?.includes("Supabase environment variables")) {
        setError("Supabase is not configured. Please check your .env.local file.");
      } else if (err.message?.includes("fetch") || err.message?.includes("Failed to fetch")) {
        setError("Network error. Please check your Supabase URL is correct and restart the dev server.");
      } else {
        setError(err.message || "Network error. Please check your connection and try again.");
      }
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <h1 className="text-xl font-semibold mb-6 text-center">Sign up</h1>
          <form onSubmit={handleSignup} className="space-y-4">
            <input 
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e)=>setEmail(e.target.value)} 
            />
            <input 
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e)=>setPassword(e.target.value)} 
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button 
              disabled={isLoading}
              className="px-4 py-3 rounded-lg bg-black text-white w-full font-medium hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Loading...' : 'Create account'}
            </button>
          </form>
          <p className="text-sm text-gray-600 mt-4 text-center">Have an account? <Link className="underline text-black font-medium" href="/auth/login">Login</Link></p>
        </div>
      </div>
    </div>
  );
}

