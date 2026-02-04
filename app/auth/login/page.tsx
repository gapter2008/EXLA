"use client";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { goOnboarding } from "@/lib/safeNavigate";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
          goOnboarding(router, safeStep);
        }
      }
    } catch (err: any) {
      console.error("Login exception:", err);
      setError(err.message || "Network error. Please check your connection and try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between px-6 py-20">
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="w-full max-w-sm space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              disabled={isLoading}
            >
              Sign In
            </Button>
          </form>

          <p className="text-[15px] text-[#64748B] text-center">
            No account?{" "}
            <Link className="text-[#0F172A] font-semibold hover:underline" href="/auth/email-signup">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}


