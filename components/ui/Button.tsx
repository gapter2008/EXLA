"use client";

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button variant
   * - primary: Black background (#0F172A)
   * - secondary: Light gray background (#F1F5F9)
   * - ghost: Transparent background
   */
  variant?: 'primary' | 'secondary' | 'ghost';
  /**
   * Show loading state with spinner
   */
  isLoading?: boolean;
  children: React.ReactNode;
}

/**
 * Reusable Button component matching Figma design system
 * - Height: 48px (h-12)
 * - Border radius: 13px (rounded-[13px])
 * - Padding: px-6
 * - Font: semibold, text-[15px]
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', isLoading, children, className = '', disabled, ...props }, ref) => {
    const baseStyles = 'h-12 rounded-[13px] px-6 font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';
    
    const variantStyles = {
      primary: 'bg-[#0F172A] text-white',
      secondary: 'bg-[#F1F5F9] text-[#0F172A]',
      ghost: 'text-[#0F172A] px-3'
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Loading...
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

