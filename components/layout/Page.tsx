"use client";

import React from 'react';

interface PageProps {
  children: React.ReactNode;
  className?: string;
  /**
   * If true, adds bottom padding to prevent content from hiding behind sticky footers
   * Default: false
   */
  withFooter?: boolean;
  /**
   * Custom horizontal padding override
   * Default: px-5 (20px)
   */
  paddingX?: string;
  /**
   * Custom vertical padding override
   * Default: py-6 (24px)
   */
  paddingY?: string;
  /**
   * Maximum width constraint
   * Default: max-w-[360px]
   */
  maxWidth?: string;
}

/**
 * Reusable page layout wrapper
 * Handles consistent horizontal padding, vertical spacing, and footer spacing
 * Works inside the existing phone frame layout
 */
export function Page({
  children,
  className = '',
  withFooter = false,
  paddingX = 'px-5',
  paddingY = 'py-6',
  maxWidth = 'max-w-[360px]',
}: PageProps) {
  const footerPadding = withFooter ? 'pb-24' : '';
  
  return (
    <div className={`w-full ${maxWidth} mx-auto ${paddingX} ${paddingY} ${footerPadding} box-border overflow-x-hidden ${className}`}>
      {children}
    </div>
  );
}

