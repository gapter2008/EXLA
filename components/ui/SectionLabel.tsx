"use client";

import React from 'react';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Section label component matching Figma design
 * - Font: 12px, semibold, uppercase
 * - Tracking: 0.06em
 * - Color: #64748B
 */
export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <div className={`text-[12px] font-semibold uppercase tracking-[0.06em] text-[#64748B] ${className}`}>
      {children}
    </div>
  );
}

