"use client";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Login error:", error);
        setError(error.message || "Failed to sign in. Please check your credentials.");
        setIsLoading(false);
        return;
      }
      if (data?.user) {
        // Ensure profile exists (create if missing)
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, onboarding_completed, onboarding_step')
          .eq('id', data.user.id)
          .maybeSingle();

        let profile = existingProfile;
        
        // If profile doesn't exist, create it
        if (!profile) {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              onboarding_completed: false,
              onboarding_step: 'welcome',
            })
            .select('id, onboarding_completed, onboarding_step')
            .single();
          
          if (createError) {
            console.error('Failed to create profile:', createError);
            // Continue anyway - OnboardingContext will handle it
          } else {
            profile = newProfile;
          }
        }

        // Source of truth: onboarding_completed === true means never redirect to onboarding
        if (profile?.onboarding_completed === true) {
          // User has completed onboarding, go to home
          router.replace("/");
        } else {
          // onboarding_completed === false OR null means send to onboarding
          // Map step names to valid routes
          const step = profile?.onboarding_step || 'welcome';
          const validSteps = ['welcome', 'profile', 'connect', 'scanning', 'complete'];
          const safeStep = validSteps.includes(step) ? step : 'welcome';
          router.replace(`/onboarding/${safeStep}` as any);
        }
      }
    } catch (err: any) {
      console.error("Login exception:", err);
      setError(err.message || "Network error. Please check your connection and try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <h1 className="text-xl font-semibold mb-6 text-center">Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
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
              {isLoading ? 'Loading...' : 'Login'}
            </button>
          </form>
          <p className="text-sm text-gray-600 mt-4 text-center">No account? <Link className="underline text-black font-medium" href="/onboarding/welcome">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}


