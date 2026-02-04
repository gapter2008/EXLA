"use client";

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  variant?: 'standard' | 'stat' | 'highlight';
  className?: string;
  onClick?: () => void;
}

/**
 * Reusable Card component matching Figma design system
 * - Border radius: 16px (rounded-[16px])
 * - Padding: p-5
 * - Border: rgba(15,23,42,0.06)
 * - Variants: standard, stat, highlight (gradient)
 */
export function Card({ 
  children, 
  variant = 'standard', 
  className = '', 
  onClick 
}: CardProps) {
  const baseStyles = 'rounded-[16px] p-5 transition-all relative';
  
  const variantStyles = {
    standard: 'bg-white border border-[rgba(15,23,42,0.06)]',
    stat: 'bg-white border border-[rgba(15,23,42,0.06)]',
    highlight: 'bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] text-white'
  };

  const clickableStyles = onClick ? 'cursor-pointer active:scale-[0.98]' : '';

  return (
    <div 
      className={`${baseStyles} ${variantStyles[variant]} ${clickableStyles} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

