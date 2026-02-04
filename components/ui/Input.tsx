"use client";

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Optional label for the input
   */
  label?: string;
  /**
   * Optional helper text displayed below the input
   */
  helperText?: string;
  /**
   * Displays an error message and styles the input accordingly
   */
  error?: string;
}

/**
 * Reusable Input component matching Figma design system
 * - Height: 48px (h-12)
 * - Border radius: 12px (rounded-[12px])
 * - Padding: px-4
 * - Background: #F8FAFC
 * - Focus border: #0F172A
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, className, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={props.id} className="block text-[13px] font-semibold text-[#0F172A] mb-3">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full h-12 px-4 bg-[#F8FAFC] rounded-[12px] border border-transparent focus:border-[#0F172A] focus:bg-white focus:outline-none text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] transition-all ${className}`}
          {...props}
        />
        {(helperText || error) && (
          <p className={`text-[12px] ${error ? 'text-red-600' : 'text-[#94A3B8]'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

