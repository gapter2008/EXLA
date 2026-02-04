"use client";

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Badge variant
   */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  /**
   * Badge size
   */
  size?: 'sm' | 'md';
}

/**
 * Reusable Badge component
 * Matches Figma spacing, radius, and typography
 * Accepts className overrides for customization
 */
export function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'md',
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-indigo-100 text-indigo-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };
  
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };
  
  const baseStyles = 'inline-flex items-center font-medium rounded-lg';
  
  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {children}
    </span>
  );
}

