import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Debug logging for both client and server
if (process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    // Client-side logging
    console.log("🔍 [CLIENT] Supabase Config:");
    console.log("  URL:", supabaseUrl || "❌ NOT SET");
    console.log("  Key:", supabaseAnonKey ? `${supabaseAnonKey.slice(0, 20)}...` : "❌ NOT SET");
    console.log("  URL valid:", supabaseUrl.startsWith("https://") && supabaseUrl.includes(".supabase.co"));
  } else {
    // Server-side logging
    console.log("🔍 [SERVER] Supabase Config:");
    console.log("  URL:", supabaseUrl || "❌ NOT SET");
    console.log("  Key:", supabaseAnonKey ? `${supabaseAnonKey.slice(0, 20)}...` : "❌ NOT SET");
  }
}

// Check if environment variables are set
const isConfigured = supabaseUrl && supabaseAnonKey && 
                     supabaseUrl !== "" && 
                     supabaseAnonKey !== "" &&
                     !supabaseUrl.includes("placeholder") &&
                     supabaseUrl.startsWith("https://");

if (!isConfigured) {
  console.error(
    "❌ Missing Supabase environment variables!\n\n" +
    "Please create a .env.local file in your project root with:\n\n" +
    "NEXT_PUBLIC_SUPABASE_URL=your_supabase_url\n" +
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key\n\n" +
    "Get these values from: https://supabase.com → Your Project → Settings → API\n" +
    "After adding the file, restart your dev server: npm run dev"
  );
  console.log("Current env values:", {
    url: supabaseUrl || "❌ NOT SET",
    key: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 10)}...` : "❌ NOT SET"
  });
}

// Create Supabase client
let supabase: SupabaseClient;

if (isConfigured) {
  // Valid configuration - create real client
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
      detectSessionInUrl: true,
  },
});
} else {
  // Missing env vars - create a mock client that returns helpful errors
  // We still need to create a client to prevent import errors
  supabase = createClient(
    "https://placeholder.supabase.co",
    "placeholder-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  ) as any;

  // Override auth methods to return helpful errors instead of trying to fetch
  const envError = {
    message: "Supabase environment variables are missing. Please create a .env.local file with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart your dev server.",
    name: "MissingEnvVars",
  };

  supabase.auth.getSession = async () => ({
    data: { session: null },
    error: envError as any,
  });

  supabase.auth.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: envError as any,
  });

  supabase.auth.signUp = async () => ({
    data: { user: null, session: null },
    error: envError as any,
  });

  supabase.auth.signOut = async () => ({
    error: envError as any,
  });

  supabase.auth.onAuthStateChange = (() => ({
    data: { subscription: { unsubscribe: () => {} } },
  })) as any;
}

export { supabase };
