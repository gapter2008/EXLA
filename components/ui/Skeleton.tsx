"use client";

import React from 'react';

interface SkeletonProps {
  /**
   * Skeleton shape
   */
  variant?: 'text' | 'circular' | 'rectangular';
  /**
   * Width (can be Tailwind class or custom)
   */
  width?: string;
  /**
   * Height (can be Tailwind class or custom)
   */
  height?: string;
  /**
   * Number of lines (for text variant)
   */
  lines?: number;
  className?: string;
}

/**
 * Reusable Skeleton component for loading states
 * Matches Figma spacing and styling
 * Accepts className overrides for customization
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-gray-200 rounded';
  
  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseStyles} ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${height || 'h-4'}`}
            style={width ? { width } : undefined}
          />
        ))}
      </div>
    );
  }
  
  const shapeStyles = {
    text: 'h-4',
    circular: 'rounded-full',
    rectangular: 'h-20',
  };
  
  const defaultWidth = variant === 'circular' ? 'w-12' : width || 'w-full';
  const defaultHeight = variant === 'circular' ? 'h-12' : height || shapeStyles[variant];
  
  return (
    <div
      className={`${baseStyles} ${defaultWidth} ${defaultHeight} ${className}`}
      style={
        width && !width.startsWith('w-')
          ? { width }
          : height && !height.startsWith('h-')
          ? { height }
          : undefined
      }
    />
  );
}

