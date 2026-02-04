"use client";

import React from 'react';
import { Home, Compass, Sparkles, Briefcase, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

/**
 * Bottom navigation component matching Figma design
 * - Fixed at bottom with backdrop blur
 * - 5 tabs: Home, Discover, AI, Deals, Profile
 */
export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'discover', icon: Compass, label: 'Discover' },
    { id: 'ai', icon: Sparkles, label: 'AI' },
    { id: 'deals', icon: Briefcase, label: 'Deals' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-[rgba(15,23,42,0.06)] px-6 pb-8 pt-2">
      <div className="flex items-center justify-between max-w-[390px] mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 py-2 transition-all min-w-[60px]"
            >
              <Icon 
                className={`w-6 h-6 transition-colors ${isActive ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[11px] transition-all ${isActive ? 'text-[#0F172A] font-semibold opacity-100' : 'text-[#94A3B8] opacity-70'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

