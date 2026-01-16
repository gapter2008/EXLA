"use client";

import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  withFooter?: boolean; // If true, adds bottom padding for footer
}

export function PageContainer({ 
  children, 
  className = '', 
  withFooter = false 
}: PageContainerProps) {
  return (
    <div className={`px-6 py-6 ${withFooter ? 'pb-24' : ''} ${className}`}>
      {children}
    </div>
  );
}

