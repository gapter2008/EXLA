"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Brand = {
  id: string;
  brand_name: string;
  contact_email: string | null;
  platform: string | null;
  industry: string | null;
  notes: string | null;
  handle?: string | null;
};

export default function DashboardPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [query, setQuery] = useState("");
  const [pitch, setPitch] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [username] = useState("Thomas");

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return brands.filter((b) =>
      [b.brand_name, b.contact_email, b.platform, b.industry, b.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [brands, query]);

  async function generatePitch(brand: Brand) {
    setLoadingId(brand.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = (user?.user_metadata?.name as string) || "Creator";
      const niche = (user?.user_metadata?.niche as string) || "content";
      const res = await fetch("/api/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, niche, brand }),
      });
      const { pitch } = await res.json();
      setPitch(pitch);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <main className="py-8">
      <section className="bg-white rounded-2xl p-6 shadow-sm border">
        <h1 className="text-3xl font-semibold">Good afternoon, {username}</h1>
        <p className="text-gray-600 mt-2">Here’s what you were working on and what’s next.</p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {["Research & Outline","Task Manager","Notes","Vidcon 2024 Details"].map((title, i)=> (
            <div key={i} className="rounded-xl border bg-gray-50">
              <div className="h-20 rounded-t-xl bg-gray-200/50" />
              <div className="p-4 text-sm">
                <div className="font-medium">{title}</div>
                <div className="text-gray-500 mt-1">{i===0?"May 23":i===1?"Apr 20":i===2?"Mar 22":"18h ago"}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <button
              className="btn-brand"
              onClick={async ()=>{
                if (!userId) return;
                // Start OAuth (mock) then call callback to create token
                await fetch(`/api/oauth/tiktok/callback?userId=${userId}`);
                alert("TikTok connected (mock)");
              }}
            >Connect TikTok</button>
            <button
              className="border rounded px-4 py-2"
              onClick={async ()=>{
                if (!userId) return;
                const res = await fetch("/api/social/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "tiktok", userId }) });
                const json = await res.json();
                if (json?.posts) {
                  // refresh UI posts list from DB
                  const r = await fetch(`/api/social/posts?userId=${userId}`);
                  const j = await r.json();
                  setBrands(j.posts || []);
                }
              }}
            >Fetch Posts</button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-gray-600 text-sm">Brands</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands..."
              className="w-full max-w-md border rounded px-3 py-2"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-gray-50">
                  <th className="py-2 pr-4">Caption</th>
                  <th className="py-2 pr-4">Metrics</th>
                  <th className="py-2 pr-4">Posted</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(brands) ? brands : []).map((p: any) => (
                  <tr key={p.id} className="border-b align-top">
                    <td className="py-2 pr-4 max-w-md"><div className="line-clamp-2">{p.caption}</div></td>
                    <td className="py-2 pr-4 text-xs text-gray-600">{p.metrics && JSON.stringify(p.metrics)}</td>
                    <td className="py-2 pr-4 text-xs">{p.posted_at ? new Date(p.posted_at).toLocaleDateString() : ""}</td>
                    <td className="py-2 pr-4">
                      <button
                        disabled={loadingId === String(p.id)}
                        onClick={async () => {
                          setLoadingId(String(p.id));
                          try {
                            await fetch("/api/openai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postIds: [p.id] }) });
                            const r = await fetch(`/api/social/posts?userId=${userId}`);
                            const j = await r.json();
                            setBrands(j.posts || []);
                          } finally { setLoadingId(null); }
                        }}
                        className="px-3 py-1 rounded bg-black text-white disabled:opacity-60"
                      >
                        {loadingId === String(p.id) ? "Analyzing..." : "Analyze with AI"}
                      </button>
                      {Array.isArray((p as any).analyses) && (p as any).analyses[0] && (
                        <div className="mt-2 p-3 border rounded bg-gray-50 text-sm">
                          <div className="font-medium mb-1">AI Summary</div>
                          <div className="whitespace-pre-wrap">{(p as any).analyses[0].summary}</div>
                          {Array.isArray((p as any).analyses[0].hooks) && (
                            <ul className="list-disc ml-5 mt-2">
                              {(p as any).analyses[0].hooks.map((h: string, idx: number)=>(<li key={idx}>{h}</li>))}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="space-y-3">
          <div className="text-gray-600 text-sm">Upcoming events</div>
          <div className="bg-white border rounded-xl p-4 space-y-3">
            {["Gusto","Flylighter Internal Release","Pay Sofi Card"].map((ev, i)=> (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-1 h-2 w-2 rounded-full ${i===1?"bg-yellow-500":"bg-green-500"}`} />
                <div>
                  <div className="text-sm font-medium">{ev}</div>
                  <div className="text-xs text-gray-500">{i===1?"1–2 PM":"Today"}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {pitch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" onClick={() => setPitch(null)}>
          <div className="bg-white max-w-2xl w-full rounded p-4 space-y-3" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-lg font-semibold">AI Pitch</h2>
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded border max-h-[60vh] overflow-auto">{pitch}</pre>
            <div className="flex justify-end gap-2">
              <button className="border rounded px-3 py-2" onClick={()=>setPitch(null)}>Close</button>
              <button className="bg-black text-white rounded px-3 py-2" onClick={()=> navigator.clipboard.writeText(pitch)}>Copy Pitch</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


