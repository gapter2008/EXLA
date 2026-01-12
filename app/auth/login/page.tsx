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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("Login error:", error);
        setError(error.message || "Failed to sign in. Please check your credentials.");
        return;
      }
      if (data?.user) {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      console.error("Login exception:", err);
      setError(err.message || "Network error. Please check your connection and try again.");
    }
  }

  return (
    <main className="h-full w-full flex items-center justify-center px-5 overflow-hidden">
      <div className="w-full max-w-[360px] mx-auto">
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
          <button className="px-4 py-3 rounded-lg bg-black text-white w-full font-medium hover:bg-gray-900 transition-colors">Login</button>
        </form>
        <p className="text-sm text-gray-600 mt-4 text-center">No account? <Link className="underline text-black font-medium" href="/auth/signup">Sign up</Link></p>
      </div>
    </main>
  );
}


