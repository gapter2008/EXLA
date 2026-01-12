"use client";
import React, { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  title: string;
  category: string;
  description: string;
};

export default function DiscoverPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    // Placeholder data to mimic Figma Community-style cards
    setItems([
      { id: "1", title: "Brand Email Templates", category: "Templates", description: "Polished outreach templates" },
      { id: "2", title: "Beauty Brands List", category: "Datasets", description: "200+ beauty brands" },
      { id: "3", title: "Pitch Generator", category: "Tools", description: "Prompt snippets" },
      { id: "4", title: "Tech Brands List", category: "Datasets", description: "Startups and accessories" },
    ]);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return items.filter(i =>
      [i.title, i.category, i.description].some(v => v.toLowerCase().includes(qq))
    );
  }, [items, q]);

  return (
    <main className="py-8">
      <h1 className="text-2xl font-semibold mb-3">Discover</h1>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Search templates, datasets, tools"
          className="w-full sm:w-80 border rounded px-3 py-2"
        />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <button className="px-3 py-1.5 rounded border bg-white">All</button>
          <button className="px-3 py-1.5 rounded border bg-white">Templates</button>
          <button className="px-3 py-1.5 rounded border bg-white">Datasets</button>
          <button className="px-3 py-1.5 rounded border bg-white">Tools</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((i)=> (
          <div key={i.id} className="group rounded-xl overflow-hidden border bg-white">
            <div className="h-28 bg-gray-100 group-hover:bg-gray-200 transition-colors" />
            <div className="p-4">
              <div className="text-sm text-indigo-600">{i.category}</div>
              <div className="font-medium">{i.title}</div>
              <div className="text-sm text-gray-600 mt-1">{i.description}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}


