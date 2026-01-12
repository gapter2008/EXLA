"use client";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    
    try {
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password, 
        options: { 
          data: { name, niche },
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
        return;
      }
      
      if (data?.user) {
        // Check if email confirmation is required
        if (data.user.email_confirmed_at) {
          router.push("/");
          router.refresh();
        } else {
          setError("Check your email to confirm your account!");
        }
      }
    } catch (err: any) {
      console.error("Signup exception:", err);
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
    <main className="h-full w-full flex items-center justify-center px-5 overflow-hidden">
      <div className="w-full max-w-[360px] mx-auto">
        <h1 className="text-xl font-semibold mb-6 text-center">Sign up</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <input 
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" 
            placeholder="Name" 
            value={name} 
            onChange={(e)=>setName(e.target.value)} 
          />
          <input 
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" 
            placeholder="Your niche (e.g., fitness, beauty)" 
            value={niche} 
            onChange={(e)=>setNiche(e.target.value)} 
          />
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
          <button className="px-4 py-3 rounded-lg bg-black text-white w-full font-medium hover:bg-gray-900 transition-colors">Create account</button>
        </form>
        <p className="text-sm text-gray-600 mt-4 text-center">Have an account? <Link className="underline text-black font-medium" href="/auth/login">Login</Link></p>
      </div>
    </main>
  );
}


