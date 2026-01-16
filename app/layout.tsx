import "./globals.css";
import React, { ReactNode } from "react";
import { OnboardingProvider } from "@/context/OnboardingContext";
import { OnboardingGuard } from "@/components/OnboardingGuard";

export const metadata = {
  title: "Exla",
  description: "Connect creators with brands",
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Exla",
    description: "Connect creators with brands",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className="h-full antialiased bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {/* Device Frame Container - Phone-sized on desktop, full screen on mobile */}
        <div className="w-full h-full flex items-center justify-center p-4 md:p-8">
          <div 
            className="
              phone-frame
              relative
              mx-auto
              w-[380px]
              aspect-[9/19.5]
              md:rounded-[2.5rem] 
              md:border-[8px] 
              md:border-gray-800 
              md:shadow-2xl
            "
            style={{
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* White screen area - fills phone shell */}
            <div className="absolute inset-0 md:rounded-[2.5rem] bg-white overflow-hidden flex flex-col">
              <div className="h-full flex flex-col overflow-hidden">
                <OnboardingProvider>
                  <OnboardingGuard>
                    {children}
                  </OnboardingGuard>
                </OnboardingProvider>
              </div>

              <div id="phone-modal-root" className="absolute inset-0 z-50 pointer-events-none" />
              <div id="phone-popover-root" className="absolute inset-0 z-40 pointer-events-none" />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}


