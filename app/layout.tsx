import "./globals.css";
import React, { ReactNode } from "react";

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
              w-full
              h-full
              max-w-[390px]
              max-h-[844px]
              md:w-[390px]
              md:h-auto
              md:max-h-[844px]
              md:aspect-[390/844]
              md:rounded-[2.5rem] 
              md:border-[8px] 
              md:border-gray-800 
              md:shadow-2xl
              bg-white 
              relative
              flex 
              flex-col
              overflow-hidden
            "
            style={{
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.1)',
              height: 'min(844px, calc(100vh - 4rem))',
            }}
          >
            {/* Inner viewport container - children control their own scrolling */}
            <div className="relative h-full w-full overflow-hidden box-border">
              {children}
            </div>
            
            {/* Modal portal root - inside phone frame */}
            <div id="phone-modal-root" className="absolute inset-0 z-50 pointer-events-none" />
            
            {/* Popover/dropdown portal root - inside phone frame */}
            <div id="phone-popover-root" className="absolute inset-0 z-40 pointer-events-none" />
          </div>
        </div>
      </body>
    </html>
  );
}


