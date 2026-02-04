"use client";

import React from 'react';
import { ChevronRight, LucideIcon } from 'lucide-react';

interface ListRowProps {
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string | React.ReactNode;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * List row component matching Figma design
 * Used for list items with icons, titles, and optional chevrons
 */
export function ListRow({ 
  icon: Icon, 
  iconColor = 'text-[#64748B]',
  iconBg = 'bg-[#F1F5F9]',
  title, 
  subtitle, 
  rightElement, 
  showChevron = false,
  onClick,
  disabled = false
}: ListRowProps) {
  const baseStyles = 'flex items-center gap-3 py-4 transition-all';
  const clickableStyles = onClick && !disabled ? 'cursor-pointer active:opacity-60' : '';
  const disabledStyles = disabled ? 'opacity-40' : '';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full ${baseStyles} ${clickableStyles} ${disabledStyles}`}
    >
      {Icon && (
        <div className={`w-9 h-9 rounded-[10px] ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-[22px] h-[22px] ${iconColor}`} strokeWidth={2} />
        </div>
      )}
      
      <div className="flex-1 text-left">
        <div className="text-[16px] font-semibold text-[#0F172A]">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-[#64748B] mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      
      {rightElement && (
        <div className="text-[13px] text-[#64748B]">
          {rightElement}
        </div>
      )}
      
      {showChevron && (
        <ChevronRight className="w-5 h-5 text-[#94A3B8] flex-shrink-0" />
      )}
    </button>
  );
}

