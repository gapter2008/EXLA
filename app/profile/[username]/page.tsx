import React from "react";

export default function ProfilePage({ params }: { params: { username: string } }) {
  const { username } = params;
  return (
    <main className="py-8">
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-indigo-200 to-pink-200" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
            <div className="h-24 w-24 rounded-full ring-4 ring-white bg-gray-200" />
            <div>
              <h1 className="text-2xl font-semibold capitalize">{username}</h1>
              <div className="text-gray-600">Creator • Content Partnerships</div>
              <div className="text-sm text-gray-500">Los Angeles, CA • 10k followers</div>
            </div>
            <div className="sm:ml-auto flex items-center gap-2">
              <button className="px-3 py-1.5 rounded bg-black text-white text-sm">Connect</button>
              <button className="px-3 py-1.5 rounded border text-sm bg-white">Message</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 sm:p-6">
          <section className="lg:col-span-2 space-y-4">
            <div className="border rounded-lg p-4">
              <h2 className="font-medium">About</h2>
              <p className="text-gray-700 text-sm mt-2">Building authentic creator-brand collaborations in the {username} niche.</p>
            </div>
            <div className="border rounded-lg p-4">
              <h2 className="font-medium">Activity</h2>
              <ul className="mt-2 text-sm text-gray-700 space-y-2">
                <li>Shared a pitch template</li>
                <li>Connected with EcoWear</li>
                <li>Posted a case study</li>
              </ul>
            </div>
          </section>
          <aside className="space-y-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium">Contact</h3>
              <div className="text-sm text-gray-700 mt-2">hello@example.com</div>
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-medium">Skills</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {["UGC", "Short-form", "Email", "Brand Deals"].map((s)=> (
                  <span key={s} className="px-2 py-1 rounded-full text-xs border bg-gray-50">{s}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}


