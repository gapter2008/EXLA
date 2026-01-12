import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Try multiple possible variable names
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY 
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_ADMIN_KEY
  || "";

// Debug logging in development
if (process.env.NODE_ENV === 'development') {
  console.log("🔍 Supabase Admin Config Check:");
  console.log("  URL:", url ? `${url.slice(0, 30)}...` : "❌ NOT SET");
  console.log("  Service Key:", serviceKey ? `${serviceKey.slice(0, 20)}... (length: ${serviceKey.length})` : "❌ NOT SET");
  console.log("  Available env vars:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("SERVICE")).join(", "));
  
  // Try to read directly from process.env to debug
  const directCheck = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("  Direct check SUPABASE_SERVICE_ROLE_KEY:", directCheck ? `FOUND (${directCheck.length} chars, starts with: ${directCheck.substring(0, 10)}...)` : "❌ NOT IN process.env");
  
  // Check all SUPABASE related vars
  const allSupabaseVars = Object.keys(process.env).filter(k => k.toUpperCase().includes("SUPABASE"));
  console.log("  All SUPABASE vars:", allSupabaseVars.join(", "));
}

if (!url) {
  console.warn("⚠️ SUPABASE_URL is not set. Using NEXT_PUBLIC_SUPABASE_URL fallback.");
}

if (!serviceKey) {
  console.error(
    "❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable!\n\n" +
    "Please add to your .env.local file:\n\n" +
    "SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here\n\n" +
    "Get this from: https://supabase.com → Your Project → Settings → API → service_role (secret)\n" +
    "After adding, restart your dev server: npm run dev"
  );
}

// Validate that we have both URL and service key before creating client
let supabaseAdmin: SupabaseClient;

if (!url || !serviceKey) {
  // Create a placeholder client with dummy values to prevent crashes
  // This will fail at runtime with clear error messages
  const envError = {
    message: "SUPABASE_SERVICE_ROLE_KEY is not configured. Please add it to .env.local and restart your dev server.",
    name: "MissingEnvVars",
  };
  
  // Create a minimal mock that properly handles method chaining
  supabaseAdmin = createClient(
    url || "https://placeholder.supabase.co",
    serviceKey || "placeholder-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  ) as any;
  
  // Override methods to return helpful errors with proper chaining
  const createMockQueryBuilder = () => {
    // Create a builder object that supports all chaining patterns
    const builder: any = {
      // Query methods that return promises
      maybeSingle: async () => ({ data: null, error: envError }),
      single: async () => ({ data: null, error: envError }),
      
      // Chainable filter methods
      limit: () => builder,
      order: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      select: () => builder,
    };
    
    // insert() returns a builder that supports .select().single() pattern
    builder.insert = () => {
      const insertBuilder = {
        select: () => builder,
      };
      return insertBuilder;
    };
    
    // update() returns builder that supports .eq() chaining
    // When .eq() is called, it should return an awaitable promise
    builder.update = () => {
      const updateBuilder: any = {
        eq: async () => {
          // Return error so updateScanJob can catch it
          return { data: null, error: envError };
        },
      };
      return updateBuilder;
    };
    
    // upsert() returns a promise that resolves with { data, error }
    // It accepts (values, options) 
    builder.upsert = async (values?: any, options?: any) => {
      return { data: null, error: envError };
    };
    
    // delete() returns builder that supports .eq() chaining  
    builder.delete = () => builder;
    
    return builder;
  };
  
  supabaseAdmin.from = (((tableName: string) => {
    console.warn(`⚠️ Attempted to access table "${tableName}" but SUPABASE_SERVICE_ROLE_KEY is not configured.`);
    return createMockQueryBuilder();
  }) as any);
} else {
  supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
}

export { supabaseAdmin };


