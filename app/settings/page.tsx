import React from "react";

const swatch = (label: string, cls: string) => (
  <div className="flex items-center gap-3">
    <div className={`h-8 w-8 rounded ${cls}`} />
    <span className="text-sm text-gray-700">{label}</span>
  </div>
);

export default function SettingsPage() {
  return (
    <main className="py-8">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <section className="card p-4 space-y-4">
        <h2 className="font-medium">Preview Brand Theme</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {swatch("Brand", "bg-brand")}
          {swatch("Foreground", "bg-brand-foreground")}
          {swatch("Muted", "bg-[hsl(var(--brand-muted))]")}
          {swatch("Ring", "bg-[hsl(var(--brand-ring))]")}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-brand focus-ring">Primary Button</button>
          <a href="#" className="link-brand">Brand Link</a>
          <div className="card border-brand/20 p-3">Card with brand border</div>
        </div>
      </section>
    </main>
  );
}


