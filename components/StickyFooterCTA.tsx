"use client";

import React from 'react';
import { Copy, CheckCircle2, ExternalLink } from 'lucide-react';

interface StickyFooterCTAProps {
  onCopy?: () => void;
  onShare?: () => void;
  copied?: boolean;
  shareUrl?: string;
}

export function StickyFooterCTA({ 
  onCopy, 
  onShare, 
  copied = false,
  shareUrl = '' 
}: StickyFooterCTAProps) {
  const handleCopy = () => {
    if (onCopy) {
      onCopy();
    } else if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
    }
  };

  const handleShare = () => {
    if (onShare) {
      onShare();
    } else if (shareUrl && navigator.share) {
      navigator.share({ title: 'Media Kit', url: shareUrl }).catch(() => {
        handleCopy();
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-gray-100 px-6 py-4 z-10 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 leading-snug break-words">Available for partnerships</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
          onClick={handleCopy}
          className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl text-sm font-semibold text-gray-700 transition-all active:scale-95 shadow-sm whitespace-nowrap"
        >
          {copied ? (
            <>
              <CheckCircle2 size={16} className="inline mr-1.5 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy size={16} className="inline mr-1.5" />
              Copy link
            </>
          )}
        </button>
        <button
          onClick={handleShare}
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 shadow-lg shadow-indigo-500/25 whitespace-nowrap"
        >
          <ExternalLink size={16} className="inline mr-1.5" />
          Share
          </button>
        </div>
      </div>
    </div>
  );
}

