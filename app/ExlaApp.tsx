"use client";

import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Home, Search, MessageSquare, FileText, User, Users, ChevronRight, Check, Loader2, Instagram, Youtube, X, Sparkles, TrendingUp, Zap, Clock, Target, Award, Bell, Copy, CheckCircle2, Eye, MessageCircle, DollarSign, ArrowRight, ChevronDown, Trash2, Send, Settings, Moon, Sun, Monitor, ChevronLeft, Mail, ExternalLink, Linkedin, Edit2, Share2, Play, Building2, Bot, Calculator, Briefcase, LogOut, User2, Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ensureProfile, getProfile, getCreatorProfile, createCreatorProfile } from '../lib/creatorHelpers';
import type { Profile, CreatorProfile } from '../lib/creatorHelpers';
import { inferNiche } from '../lib/inferNiche';
import { useOnboarding } from '../context/OnboardingContext';
import type { MediaKitData } from '../lib/getMediaKitData';
import { sanitizeChatMessage } from '../lib/chatMessageSanitizer';
import { StickyFooterCTA } from '../components/StickyFooterCTA';
import { PageContainer } from '../components/PageContainer';
import { goOnboardingPush } from '../lib/safeNavigate';
import { SectionLabel, ListRow } from '../components/ui';

// Global User Data Store Context
interface CreatorAiProfileRow {
  headline: string | null;
  bio: string | null;
  niches: string[];
  themes: string[];
  brand_fit: Array<{ category: string; reasoning?: string }>;
  suggested_collab_types: string[];
  updated_at: string | null;
}
interface UserDataStore {
  // Data
  socialAccounts: Array<{ platform: string; handle: string | null; created_at: string }> | null;
  creatorMetrics: Array<{ platform: string; followers: number; avg_views_10: number; engagement_rate_10: number; total_views: number; top_videos?: any }> | null;
  creatorProfile: { size_tier: string; primary_topics?: string[]; keywords?: string[]; summary?: string } | null;
  creatorAiProfile: CreatorAiProfileRow | null;
  brandRecommendations: any[] | null;
  brandRecommendationsCount: number;
  pitches: any[] | null;
  pitchesCounts: { draft: number; sent: number; replied: number; closed: number; ignored: number; total: number };
  followups: any[] | null;
  
  // State
  loading: boolean;
  lastFetched: number | null;
  
  // Actions
  refresh: () => Promise<void>;
  refreshSilently: () => Promise<void>;
  invalidateBrandRecommendations: () => void;
  invalidatePitches: () => void;
}

const UserDataContext = createContext<UserDataStore | null>(null);

// ============================================================================
// CONNECTION STATE HELPERS - Platform-agnostic connection management
// ============================================================================

/**
 * Get available platforms in priority order
 */
export const getAvailablePlatforms = (): Array<{ id: string; name: string; enabled: boolean }> => {
  return [
    { id: 'youtube', name: 'YouTube', enabled: true },
    { id: 'tiktok', name: 'TikTok', enabled: true }, // May be sandbox only
    { id: 'instagram', name: 'Instagram', enabled: false }, // Coming soon
  ];
};

/**
 * Get connected platforms for a user from social accounts array
 */
export const getConnectedPlatforms = (socialAccounts: Array<{ platform: string }> | null): string[] => {
  if (!socialAccounts || socialAccounts.length === 0) return [];
  return socialAccounts.map(acc => acc.platform);
};

/**
 * Get primary CTA configuration based on connection state
 */
export const getPrimaryCTA = (
  connectedPlatforms: string[],
  availablePlatforms: Array<{ id: string; name: string; enabled: boolean }>,
  onConnect: () => void
): { label: string; sublabel: string; action: () => void; recommendedPlatform?: string } => {
  const enabledPlatforms = availablePlatforms.filter(p => p.enabled);
  const nextAvailablePlatform = enabledPlatforms.find(p => !connectedPlatforms.includes(p.id));
  
  if (connectedPlatforms.length === 0) {
    return {
      label: 'Connect a social account',
      sublabel: 'Connect one account to unlock personalized matches',
      action: onConnect,
      recommendedPlatform: nextAvailablePlatform?.name,
    };
  } else if (connectedPlatforms.length < enabledPlatforms.length) {
    return {
      label: 'Add another account',
      sublabel: 'Improve match quality by connecting more platforms',
      action: onConnect,
      recommendedPlatform: nextAvailablePlatform?.name,
    };
  } else {
    // All enabled platforms connected
    return {
      label: 'All accounts connected',
      sublabel: 'You\'ve connected all available platforms',
      action: onConnect,
    };
  }
};

// ============================================================================
// CONNECT ACCOUNT CTA COMPONENT - Reusable platform-agnostic CTA
// ============================================================================

interface ConnectAccountCTAProps {
  connectedPlatforms: string[];
  onConnect: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  showSublabel?: boolean;
  className?: string;
}

const ConnectAccountCTA = ({
  connectedPlatforms,
  onConnect,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  showSublabel = true,
  className = '',
}: ConnectAccountCTAProps) => {
  const availablePlatforms = getAvailablePlatforms();
  const cta = getPrimaryCTA(connectedPlatforms, availablePlatforms, onConnect);

  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3',
    md: 'text-sm py-2.5 px-4',
    lg: 'text-base py-3 px-5',
  };

  const variantClasses = {
    primary: 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700',
    secondary: 'bg-white border-2 border-gray-200 text-gray-900 font-semibold rounded-xl hover:border-gray-300 hover:bg-gray-50 shadow-sm',
    ghost: 'bg-transparent text-gray-700 font-medium hover:bg-gray-50',
  };

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      <button
        type="button"
        onClick={cta.action}
        className={`${fullWidth ? 'w-full' : ''} ${sizeClasses[size]} ${variantClasses[variant]} transition-transform duration-150 active:scale-[0.99] ${className}`}
        style={{ minHeight: size === 'lg' ? '48px' : size === 'md' ? '44px' : '36px' }}
      >
        {cta.label}
      </button>
      {showSublabel && cta.sublabel && (
        <p className={`text-center mt-2 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-600`}>
          {cta.sublabel}
          {cta.recommendedPlatform && (
            <span className="block mt-1 text-gray-500">
              Recommended: {cta.recommendedPlatform}
            </span>
          )}
        </p>
      )}
    </div>
  );
};

// User Data Provider Component
const UserDataProvider = ({ children, userId }: { children: React.ReactNode; userId: string | null }) => {
  const [socialAccounts, setSocialAccounts] = useState<Array<{ platform: string; handle: string | null; created_at: string }> | null>(null);
  const [creatorMetrics, setCreatorMetrics] = useState<Array<{ platform: string; followers: number; avg_views_10: number; engagement_rate_10: number; total_views: number; top_videos?: any }> | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<{ size_tier: string; primary_topics?: string[]; keywords?: string[]; summary?: string } | null>(null);
  const [creatorAiProfile, setCreatorAiProfile] = useState<CreatorAiProfileRow | null>(null);
  const [brandRecommendations, setBrandRecommendations] = useState<any[] | null>(null);
  const [brandRecommendationsCount, setBrandRecommendationsCount] = useState(0);
  const [pitches, setPitches] = useState<any[] | null>(null);
  const [pitchesCounts, setPitchesCounts] = useState({ draft: 0, sent: 0, replied: 0, closed: 0, ignored: 0, total: 0 });
  const [followups, setFollowups] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  // Bootstrap fetch - loads all user data at once
  const bootstrapFetch = useCallback(async (silent = false) => {
    if (!userId) return;
    
    if (!silent) setLoading(true);
    
    try {
      const { supabase } = await import('../lib/supabaseClient');
      
      // Fetch all data in parallel
      const [
        socialAccountsResult,
        metricsResult,
        profileResult,
        aiProfileResult,
        recommendationsResult,
        pitchesResult,
        followupsResult,
      ] = await Promise.all([
        supabase
          .from('social_accounts')
          .select('platform, handle, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        
        supabase
          .from('creator_metrics')
          .select('platform, followers, avg_views_10, engagement_rate_10, total_views, top_videos, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false }),
        
        supabase
          .from('creator_profiles')
          .select('size_tier, primary_topics, keywords, summary, user_id')
          .eq('user_id', userId)
          .single(),
        
        supabase
          .from('creator_ai_profiles')
          .select('headline, bio, niches, themes, brand_fit, suggested_collab_types, updated_at')
          .eq('user_id', userId)
          .maybeSingle(),
        
        supabase
          .from('brand_recommendations')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        
        fetch(`/api/pitches/list?userId=${userId}`).then(r => r.ok ? r.json() : { pitches: [] }),
        
        fetch(`/api/followups?userId=${userId}`).then(r => r.ok ? r.json() : { followups: [] }),
      ]);

      // Update state with fetched data
      if (!socialAccountsResult.error && socialAccountsResult.data) {
        setSocialAccounts(socialAccountsResult.data);
      }

      if (!metricsResult.error && metricsResult.data) {
        // Log which platform's data is being loaded
        // Note: RLS policies ensure only this user's data is returned
        const platforms = metricsResult.data.map((m: any) => m.platform).join(",");
        console.log(`[ExlaApp] Data refresh - userId=${userId}, loaded platforms=${platforms || "none"}, metrics count=${metricsResult.data.length}`);
        
        setCreatorMetrics(metricsResult.data);
      }

      if (!profileResult.error && profileResult.data) {
        // Leak detection guard
        if (profileResult.data.user_id && profileResult.data.user_id !== userId) {
          console.error(`[ExlaApp] CRITICAL: Data leak detected! userId=${userId}, profile.user_id=${profileResult.data.user_id}`);
          throw new Error("Data security error: returned profile does not match current user");
        }
        
        setCreatorProfile(profileResult.data);
      }

      if (!aiProfileResult.error && aiProfileResult.data) {
        const row = aiProfileResult.data as any;
        setCreatorAiProfile({
          headline: row.headline ?? null,
          bio: row.bio ?? null,
          niches: Array.isArray(row.niches) ? row.niches : [],
          themes: Array.isArray(row.themes) ? row.themes : [],
          brand_fit: Array.isArray(row.brand_fit) ? row.brand_fit : [],
          suggested_collab_types: Array.isArray(row.suggested_collab_types) ? row.suggested_collab_types : [],
          updated_at: row.updated_at ?? null,
        });
      } else {
        setCreatorAiProfile(null);
      }

      if (!recommendationsResult.error && recommendationsResult.data) {
        // Leak detection guard
        const wrongUser = recommendationsResult.data.find((r: any) => r.user_id && r.user_id !== userId);
        if (wrongUser) {
          console.error(`[ExlaApp] CRITICAL: Data leak detected! userId=${userId}, found recommendation.user_id=${wrongUser.user_id}`);
          throw new Error("Data security error: returned recommendations do not match current user");
        }
        
        // Log which user's data is being loaded
        console.log(`[ExlaApp] Data refresh - userId=${userId}, loaded ${recommendationsResult.data.length} brand recommendations`);
        
        setBrandRecommendations(recommendationsResult.data);
        setBrandRecommendationsCount(recommendationsResult.data.filter((r: any) => r.status === 'new').length);
      }

      if (pitchesResult.pitches) {
        setPitches(pitchesResult.pitches);
        const counts = pitchesResult.pitches.reduce((acc: any, p: any) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          acc.total = (acc.total || 0) + 1;
          return acc;
        }, { draft: 0, sent: 0, replied: 0, closed: 0, ignored: 0, total: 0 });
        setPitchesCounts(counts);
      }

      if (followupsResult.followups) {
        setFollowups(followupsResult.followups);
      }

      setLastFetched(Date.now());
    } catch (err) {
      console.error('Bootstrap fetch error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId]);

  // Refresh function (with loading state)
  const refresh = useCallback(async () => {
    await bootstrapFetch(false);
  }, [bootstrapFetch]);

  // Silent refresh (no loading state)
  const refreshSilently = useCallback(async () => {
    await bootstrapFetch(true);
  }, [bootstrapFetch]);

  // Invalidate and refetch brand recommendations
  const invalidateBrandRecommendations = useCallback(async () => {
    if (!userId) return;
    const { supabase } = await import('../lib/supabaseClient');
    const { data } = await supabase
      .from('brand_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (data) {
      // Leak detection guard
      const wrongUser = data.find((r: any) => r.user_id && r.user_id !== userId);
      if (wrongUser) {
        console.error(`[ExlaApp] CRITICAL: Data leak detected! userId=${userId}, found recommendation.user_id=${wrongUser.user_id}`);
        throw new Error("Data security error: returned recommendations do not match current user");
      }
      
      console.log(`[ExlaApp] Invalidated brand recommendations - userId=${userId}, count=${data.length}`);
      
      setBrandRecommendations(data);
      setBrandRecommendationsCount(data.filter((r: any) => r.status === 'new').length);
    }
  }, [userId]);

  // Invalidate and refetch pitches
  const invalidatePitches = useCallback(async () => {
    if (!userId) return;
    try {
      const [pitchesResult, followupsResult] = await Promise.all([
        fetch(`/api/pitches/list?userId=${userId}`).then(r => r.ok ? r.json() : { pitches: [] }),
        fetch(`/api/followups?userId=${userId}`).then(r => r.ok ? r.json() : { followups: [] }),
      ]);

      if (pitchesResult.pitches) {
        setPitches(pitchesResult.pitches);
        const counts = pitchesResult.pitches.reduce((acc: any, p: any) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          acc.total = (acc.total || 0) + 1;
          return acc;
        }, { draft: 0, sent: 0, replied: 0, closed: 0, ignored: 0, total: 0 });
        setPitchesCounts(counts);
      }

      if (followupsResult.followups) {
        setFollowups(followupsResult.followups);
      }
    } catch (err) {
      console.error('Failed to invalidate pitches:', err);
    }
  }, [userId]);

  // Initial bootstrap on mount
  useEffect(() => {
    if (userId && lastFetched === null) {
      bootstrapFetch(false);
    }
  }, [userId, lastFetched, bootstrapFetch]);

  // Background refresh every 60 seconds
  useEffect(() => {
    if (!userId || lastFetched === null) return;
    
    const interval = setInterval(() => {
      refreshSilently();
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [userId, lastFetched, refreshSilently]);

  // Refresh silently on window focus (when user switches back to tab)
  useEffect(() => {
    if (!userId) return;
    
    const handleFocus = () => {
      // Refresh if data is older than 30 seconds
      if (lastFetched && Date.now() - lastFetched > 30000) {
        refreshSilently();
      }
    };

    const handleRefreshEvent = () => {
      refreshSilently();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('exla-refresh-user-data', handleRefreshEvent);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('exla-refresh-user-data', handleRefreshEvent);
    };
  }, [userId, lastFetched, refreshSilently]);

  const value: UserDataStore = {
    socialAccounts,
    creatorMetrics,
    creatorProfile,
    creatorAiProfile,
    brandRecommendations,
    brandRecommendationsCount,
    pitches,
    pitchesCounts,
    followups,
    loading,
    lastFetched,
    refresh,
    refreshSilently,
    invalidateBrandRecommendations,
    invalidatePitches,
  };

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
};

// Hook to use the user data store
export const useUserData = () => {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error('useUserData must be used within UserDataProvider');
  }
  return context;
};

const BRAND_CATEGORIES = ['Fashion', 'Fitness', 'Beauty', 'Tech', 'Food', 'Travel', 'Lifestyle', 'Gaming', 'Home', 'Wellness'];

// Utility functions
const getTimeAgo = (timestamp: number | string) => {
  const ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
};

// Gamification system
const CREATOR_TIERS = [
  { name: 'Starter', xpRequired: 0, color: 'gray' },
  { name: 'Active', xpRequired: 100, color: 'blue' },
  { name: 'In Demand', xpRequired: 500, color: 'indigo' },
  { name: 'Top 10%', xpRequired: 2000, color: 'purple' }
];

const getCurrentTier = (xp: number) => {
  for (let i = CREATOR_TIERS.length - 1; i >= 0; i--) {
    if (xp >= CREATOR_TIERS[i].xpRequired) {
      return { ...CREATOR_TIERS[i], index: i };
    }
  }
  return { ...CREATOR_TIERS[0], index: 0 };
};

const getProgressToNextTier = (xp: number) => {
  const currentTier = getCurrentTier(xp);
  const nextTier = CREATOR_TIERS[currentTier.index + 1];
  
  if (!nextTier) return { progress: 100, nextTier: null, xpNeeded: 0 };
  
  const xpInCurrentTier = xp - currentTier.xpRequired;
  const xpNeededForNext = nextTier.xpRequired - currentTier.xpRequired;
  const progress = (xpInCurrentTier / xpNeededForNext) * 100;
  
  return { progress, nextTier, xpNeeded: nextTier.xpRequired - xp };
};

const awardXP = (amount: number) => {
  if (typeof window === 'undefined') return 0;
  const currentXP = parseInt(localStorage.getItem('exla_creator_xp') || '150');
  const newXP = currentXP + amount;
  localStorage.setItem('exla_creator_xp', newXP.toString());
  return newXP;
};

// Components
const ExlaLogo = ({ size = 32, opacity = 1 }) => (
  <img 
    src="/brand/logo.png" 
    alt="Exla" 
    width={size} 
    height={size}
    style={{ opacity, display: 'block' }}
  />
);

const PoweredByExla = ({ size = 12 }) => (
  <div className="flex items-center gap-1.5 text-xs text-gray-400">
    <span>Powered by</span>
    <ExlaLogo size={size} opacity={0.6} />
    <span className="font-medium">Exla</span>
  </div>
);

// Top App Bar Component
// AppBar Component - Uses Container for consistent alignment
const AppBar = ({ title, onNavigate }: { title?: string; onNavigate?: (tab: string) => void }) => {
  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <Container>
        <div className="grid grid-cols-3 items-center h-14">
          {/* Left: Empty spacer */}
          <div className="justify-self-start"></div>
          
          {/* Center: Exla logo - clickable to go to Home */}
          <div className="justify-self-center">
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('home')}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <ExlaLogo size={20} opacity={1} />
              <span className="text-sm font-semibold text-gray-900 tracking-tight">Exla</span>
            </button>
          </div>
          
          {/* Right: Empty spacer (can be used for page actions) */}
          <div className="justify-self-end"></div>
        </div>
      </Container>
    </div>
  );
};

// ============================================================================
// LAYOUT SYSTEM - Consistent, premium, app-like layout components
// ============================================================================

// Container Component - Single source of truth for horizontal padding + max width
// Enforces: w-full max-w-[360px] mx-auto px-5 box-border overflow-x-hidden
const Container = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <div 
      className={`w-full max-w-[360px] mx-auto px-5 box-border overflow-x-hidden ${className}`}
      // Dev helper: uncomment to visualize container bounds
      // style={{ outline: '1px dashed rgba(255,0,0,0.2)' }}
    >
      {children}
    </div>
  );
};

// Screen Component - Global layout container that ALWAYS uses Container
// Props:
//   scroll?: boolean (default true for tab pages, false for auth)
//   center?: boolean (for empty states)
//   className?: string (applied to Container, not root)
// Structure: Root div (h-full w-full) -> Container -> children
const Screen = ({ 
  children, 
  className = '', 
  scroll = true,  // Default true for tab pages
  center = false 
}: { 
  children: React.ReactNode; 
  className?: string; 
  scroll?: boolean;
  center?: boolean;
}) => {
  // Scroll behavior
  const scrollClasses = scroll 
    ? 'overflow-y-auto overscroll-contain no-scrollbar touch-pan-y'
    : 'overflow-hidden';
  
  // Center content (for empty states)
  const containerClasses = center 
    ? `${className} flex flex-col items-center justify-center h-full` 
    : className;
  
  // Root div: h-full w-full overflow-x-hidden
  // Apply bottom padding for tab bar if scrolling
  const bottomPadding = scroll ? 'pb-24' : '';
  
  return (
    <div className={`h-full w-full overflow-x-hidden ${scrollClasses} ${bottomPadding}`}>
      <Container className={containerClasses}>
        {children}
      </Container>
    </div>
  );
};

// Legacy Content alias for backward compatibility (but Container now has px-5 built-in)
const Content = ({ children, className = '', gap = 'gap-4' }: { children: React.ReactNode; className?: string; gap?: string }) => {
  return (
    <div className={`flex flex-col ${gap} ${className}`}>
      {children}
    </div>
  );
};

const ProgressBar = ({ progress, color = 'indigo' }: { progress: number; color?: 'indigo' | 'purple' | 'blue' }) => {
  const colorClasses = {
    indigo: 'from-indigo-500 to-indigo-600',
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600'
  };
  
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div 
        className={`h-full transition-all duration-500 bg-gradient-to-r ${colorClasses[color]}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

// ============================================================================
// DESIGN SYSTEM PRIMITIVES - Consistent UI components
// ============================================================================

// Button Components - Consistent styling across app
const PrimaryButton = ({ children, onClick, fullWidth = false, disabled = false, className = '', type = 'button', size = 'md' }: { children: React.ReactNode; onClick?: () => void; fullWidth?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit' | 'reset'; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base'
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClasses[size]} font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ minHeight: size === 'lg' ? '48px' : size === 'md' ? '44px' : '36px' }}
    >
      {children}
    </button>
  );
};

const SecondaryButton = ({ children, onClick, fullWidth = false, disabled = false, className = '', type = 'button', size = 'md' }: { children: React.ReactNode; onClick?: () => void; fullWidth?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit' | 'reset'; size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base'
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClasses[size]} font-semibold rounded-xl bg-white border-2 border-gray-200 text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ minHeight: size === 'lg' ? '48px' : size === 'md' ? '44px' : '36px' }}
    >
      {children}
    </button>
  );
};

const DestructiveButton = ({ children, onClick, fullWidth = false, disabled = false, className = '', type = 'button', variant = 'filled' }: { children: React.ReactNode; onClick?: () => void; fullWidth?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit' | 'reset'; variant?: 'filled' | 'outline' }) => {
  const baseClasses = 'px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';
  const variantClasses = variant === 'filled' 
    ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
    : 'bg-white border-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ minHeight: '44px' }}
    >
      {children}
    </button>
  );
};

// Legacy Button component for backward compatibility
const Button = ({ children, onClick, variant = 'primary', fullWidth, disabled = false, className = '', type = 'button', isLoading = false }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; fullWidth?: boolean; disabled?: boolean; className?: string; type?: 'button' | 'submit' | 'reset'; isLoading?: boolean }) => {
  if (variant === 'primary') {
    return <PrimaryButton onClick={onClick} fullWidth={fullWidth} disabled={disabled || isLoading} className={className} type={type}>{isLoading ? <><Loader2 className="animate-spin mr-2" size={16} /> Loading...</> : children}</PrimaryButton>;
  } else if (variant === 'secondary') {
    return <SecondaryButton onClick={onClick} fullWidth={fullWidth} disabled={disabled || isLoading} className={className} type={type}>{isLoading ? <><Loader2 className="animate-spin mr-2" size={16} /> Loading...</> : children}</SecondaryButton>;
  }
  const baseStyles = "px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`${baseStyles} bg-transparent text-gray-700 hover:bg-gray-50 ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {isLoading ? <><Loader2 className="animate-spin mr-2" size={16} /> Loading...</> : children}
    </button>
  );
};

// Card Component - Consistent card styling
const Card = ({ children, className = '', padding = 'p-4', variant }: { children: React.ReactNode; className?: string; padding?: string; variant?: 'highlight' | 'default' }) => {
  const variantStyles = variant === 'highlight' 
    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-0 shadow-lg'
    : 'bg-white border border-gray-200';
  return (
    <div className={`${variantStyles} rounded-xl shadow-sm ${padding} ${className}`}>
      {children}
    </div>
  );
};

// Typography Components
const PageTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <h1 className={`text-xl font-semibold text-gray-900 ${className}`}>
      {children}
    </h1>
  );
};

const MutedText = ({ children, className = '', size = 'sm' }: { children: React.ReactNode; className?: string; size?: 'xs' | 'sm' | 'base' }) => {
  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base'
  };
  return (
    <p className={`${sizeClasses[size]} text-gray-600 ${className}`}>
      {children}
    </p>
  );
};

const HelperText = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <p className={`text-xs text-gray-500 ${className}`}>
      {children}
    </p>
  );
};

// Chip Component for tabs/filters
const Chip = ({ children, active = false, onClick, className = '' }: { children: React.ReactNode; active?: boolean; onClick?: () => void; className?: string }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all shrink-0 ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${className}`}
    >
      {children}
    </button>
  );
};

const BottomNav = ({ active, onNavigate }: { active: string; onNavigate: (tab: string) => void }) => {
  const tabs = [
    { id: 'home', icon: 'logo', label: 'Home' },
    { id: 'discover', icon: Search, label: 'Discover' },
    { id: 'ai', icon: MessageSquare, label: 'AI' },
    { id: 'deals', icon: FileText, label: 'Deals' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] box-border overflow-x-hidden"
      style={{ 
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
        height: 'calc(4rem + max(0.5rem, env(safe-area-inset-bottom, 0px)))'
      }}
    >
      <Container className="flex justify-around items-center h-16 px-1 box-border">
        {tabs.map(tab => {
          const isActive = active === tab.id;
          const isLogo = tab.icon === 'logo';
          
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 min-w-0 flex-1 h-full transition-colors touch-manipulation active:opacity-70 ${
                isActive ? 'text-purple-600' : 'text-gray-400'
              }`}
              style={{ minHeight: '44px', minWidth: '44px' }} // iOS minimum touch target
            >
              {isLogo ? (
                <ExlaLogo size={24} opacity={isActive ? 1 : 0.6} />
              ) : (
                <>
                  {React.createElement(tab.icon, { size: 24, strokeWidth: isActive ? 2.5 : 1.5 })}
                </>
              )}
              <span className="text-[11px] font-medium leading-tight mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </Container>
    </div>
  );
};

// Feed Item Component
const FeedItem = ({ notification, onAction }: { notification: any; onAction?: () => void }) => {
  const iconMap = {
    sparkles: Sparkles,
    eye: Eye,
    message: MessageCircle,
    clock: Clock,
    dollar: DollarSign
  };
  
  const Icon = (iconMap[notification.icon as keyof typeof iconMap] || Sparkles) as React.ComponentType<any>;
  
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
      notification.read ? 'border-gray-100 bg-white' : 'border-indigo-100 bg-indigo-50/30'
    }`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
        <Icon size={16} className="text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
        <p className="text-xs text-gray-600 mt-0.5">{notification.description}</p>
        <p className="text-xs text-gray-500 mt-1">{getTimeAgo(notification.timestamp)}</p>
      </div>
      {onAction && notification.type === 'reply' && (
        <button className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          Reply
        </button>
      )}
    </div>
  );
};

// Helper component to render modals inside phone frame
const PhoneModal = ({ children, onClickBackdrop }: { children: React.ReactNode; onClickBackdrop?: () => void }) => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  
  const modalRoot = document.getElementById('phone-modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div 
      className="absolute inset-0 z-50 pointer-events-auto" 
      onClick={onClickBackdrop}
    >
      {children}
    </div>,
    modalRoot
  );
};

// Pitch Flow Modal - Enhanced with real database integration
const PitchFlowModal = ({ brand, onClose, onComplete }: { brand: any; onClose: () => void; onComplete: () => void }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<'email' | 'dm'>('email');
  const [deliverable, setDeliverable] = useState('Instagram Reel');
  const [dealType, setDealType] = useState('Paid');
  const [generating, setGenerating] = useState(false);
  const [pitchId, setPitchId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);

  // Calculate suggested rate based on deal type and get creator profile
  useEffect(() => {
    const fetchCreator = async () => {
      if (!user) return;
      try {
        const { supabase } = await import('../lib/supabaseClient');
        // Get all metrics, prioritize TikTok > YouTube > most recent
        const { data: allMetrics } = await supabase
          .from('creator_metrics')
          .select('platform, followers, avg_views_10, engagement_rate_10, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        
        // Select primary platform: TikTok > YouTube > most recent
        // Note: RLS policies ensure only this user's data is returned
        let metrics: any = null;
        if (allMetrics && allMetrics.length > 0) {
          const tiktokMetrics = allMetrics.find((m: any) => m.platform === 'tiktok');
          const youtubeMetrics = allMetrics.find((m: any) => m.platform === 'youtube');
          metrics = tiktokMetrics || youtubeMetrics || allMetrics[0];
          console.log(`[ExlaApp] Pitch modal - userId=${user.id}, selected platform=${metrics.platform}, available platforms=${allMetrics.map((m: any) => m.platform).join(",")}`);
        } else {
          console.log(`[ExlaApp] Pitch modal - userId=${user.id}, no metrics found`);
        }

        if (metrics) {
          // Simple rate calculation: $0.01 per 1000 avg views
          const baseRate = Math.floor((metrics.avg_views_10 / 1000) * 10);
          setSuggestedRate(dealType === 'Paid' ? Math.max(50, baseRate) : 0);
        }
      } catch (err) {
        console.error('Failed to fetch creator metrics:', err);
      }
    };
    fetchCreator();
  }, [user, dealType]);

  const handleGeneratePitch = async () => {
    if (!user) return;
    
    setGenerating(true);
    try {
      // Get creator profile
      const profile = await getProfile(user.id);
      const creator = await getCreatorProfile(user.id);
      const name = profile?.full_name || profile?.username || 'Creator';
      const niche = creator?.niche || 'content creator';

      // Generate pitch using OpenAI
      const pitchResponse = await fetch('/api/pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          niche,
          brand: {
            brand_name: brand.brand_name || brand.name,
            category: brand.category,
            why_match: brand.why_match,
          },
          suggestedRate: suggestedRate || 0,
          deliverable,
          channel,
        }),
      });

      if (!pitchResponse.ok) {
        throw new Error('Failed to generate pitch');
      }

      const pitchData = await pitchResponse.json();
      setSubject(pitchData.subject || '');
      setBody(pitchData.body || '');

      // Create draft pitch in database
      const createResponse = await fetch('/api/pitches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          brandName: brand.brand_name || brand.name,
          brandWebsite: brand.brand_website || null,
          channel: channel,
          subject: channel === 'email' ? (pitchData.subject || '') : null,
          body: pitchData.body || '',
          suggestedRate: suggestedRate || null,
      deliverable: deliverable,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create pitch draft');
      }

      const { pitch } = await createResponse.json();
      setPitchId(pitch.id);

      setStep(2);
    } catch (err: any) {
      alert(err.message || 'Failed to generate pitch');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPitch = () => {
    const textToCopy = channel === 'email' 
      ? `Subject: ${subject}\n\n${body}`
      : body;
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenEmailDraft = () => {
    if (channel !== 'email') return;
    
    const subjectEncoded = encodeURIComponent(subject);
    const bodyEncoded = encodeURIComponent(body);
    const mailtoLink = `mailto:?subject=${subjectEncoded}&body=${bodyEncoded}`;
    
    window.location.href = mailtoLink;
  };

  const handleMarkAsSent = async () => {
    if (!user || !pitchId) return;
    
    setMarkingSent(true);
    try {
      const response = await fetch('/api/pitches/mark-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          pitchId: pitchId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark pitch as sent');
      }
    
    awardXP(25);
      alert('Marked as sent. Follow-up scheduled in 3 days.');
    onComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to mark pitch as sent');
    } finally {
      setMarkingSent(false);
    }
  };

  if (step === 1) {
    return (
      <PhoneModal onClickBackdrop={onClose}>
        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center" onClick={onClose}>
          <div className="w-full max-w-full bg-white rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Pitch details</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Channel</label>
              <div className="flex gap-2">
                {(['email', 'dm'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setChannel(type)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all ${
                      channel === type
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {type === 'email' ? 'Email' : 'DM'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Deliverable</label>
              <select 
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
              >
                <option>Instagram Reel</option>
                <option>Instagram Story</option>
                <option>TikTok Video</option>
                <option>YouTube Video</option>
                <option>Instagram Post</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Deal type</label>
              <div className="flex gap-2">
                {['Paid', 'Gifted', 'Paid + Gifted'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDealType(type)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all ${
                      dealType === type
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={handleGeneratePitch} fullWidth disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Generating...
              </>
            ) : (
              'Generate pitch'
            )}
          </Button>
        </div>
      </div>
    </PhoneModal>
    );
  }

  return (
    <PhoneModal onClickBackdrop={onClose}>
      <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center" onClick={onClose}>
        <div className="w-full max-w-full bg-white rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Your pitch</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Channel toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Channel</label>
          <div className="flex gap-2">
            {(['email', 'dm'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setChannel(type)}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all ${
                  channel === type
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {type === 'email' ? 'Email' : 'DM'}
              </button>
            ))}
          </div>
        </div>

        {/* Subject field (Email only) */}
        {channel === 'email' && (
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-600"
              placeholder="Email subject"
            />
          </div>
        )}

        {/* Body field */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-600 resize-none"
            placeholder="Pitch body"
          />
        </div>

        {/* Suggested rate */}
        {suggestedRate !== null && suggestedRate > 0 && (
          <div className="p-3 bg-indigo-50 rounded-lg">
            <p className="text-xs text-indigo-700 font-medium">Suggested rate: ${suggestedRate}</p>
            <p className="text-xs text-indigo-600 mt-0.5">Based on your engagement and deliverable type</p>
          </div>
        )}

        <PoweredByExla />

        {/* Action buttons */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCopyPitch} className="flex-1">
              {copied ? (
                <>
                  <Check size={16} className="mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} className="mr-2" />
                  Copy pitch
                </>
              )}
          </Button>
            {channel === 'email' && (
              <Button variant="secondary" onClick={handleOpenEmailDraft}>
                Open email draft
          </Button>
            )}
          </div>
          <Button 
            fullWidth 
            onClick={handleMarkAsSent}
            disabled={markingSent || !body.trim()}
          >
            {markingSent ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Marking...
              </>
            ) : (
              'Mark as sent (+25 XP)'
            )}
          </Button>
        </div>
        </div>
      </div>
    </PhoneModal>
  );
};

// Notifications Screen - Empty state only
const NotificationsScreen = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-6 py-8 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="text-center py-12 space-y-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto flex items-center justify-center">
            <Bell size={32} className="text-gray-400" />
            </div>
          <h2 className="text-xl font-semibold text-gray-900">No notifications yet</h2>
          <p className="text-sm text-gray-600 max-w-sm mx-auto">
            You'll see updates about your pitches and deals here.
          </p>
        </div>
      </div>
    </div>
  );
};

// Extract YouTube video ID from watch URL or youtu.be short URL (no DB dependency)
function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return u.searchParams.get('v');
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  } catch { }
  return null;
}

// Public Media Kit Screen
const PublicMediaKit = ({ onClose }: { onClose: () => void }) => {
  const { user, loading: authLoading } = useAuth();
  let onboardingContext: { updateProfile?: (partial: any) => Promise<void> } | null = null;
  try {
    onboardingContext = useOnboarding();
  } catch {
    // OnboardingContext not available, will use direct Supabase
  }
  const [kitData, setKitData] = useState<MediaKitData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [inferredNiche, setInferredNiche] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [scanJobError, setScanJobError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setLoading(false);
          return;
        }
        const res = await fetch('/api/media-kit', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to load media kit (${res.status})`);
        }
        const data: MediaKitData = await res.json();
        setKitData(data);

        // Also fetch profile and creator for compatibility (for display name, etc.)
        const userProfile = await getProfile(user.id);
        let creatorProfile = await getCreatorProfile(user.id);
        setProfile(userProfile);
        setCreator(creatorProfile);

        // Fetch diagnostics in dev mode or with ?debug=1
        const isDev = process.env.NODE_ENV === 'development';
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const showDebug = isDev || urlParams?.get('debug') === '1';
        
        if (showDebug && typeof window !== 'undefined') {
          const { supabase } = await import('../lib/supabaseClient');
          
          // Check profile exists
          const { data: profileCheck } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          
          // Get latest scan job
          const { data: latestJob } = await supabase
            .from('scan_jobs')
            .select('id, status, progress, error, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Count social accounts
          const { data: accounts, count: accountsCount } = await supabase
            .from('social_accounts')
            .select('platform, handle, scan_status', { count: 'exact' })
            .eq('user_id', user.id);
          
          // Count creator metrics (scan results)
          const { data: metrics, count: metricsCount } = await supabase
            .from('creator_metrics')
            .select('platform', { count: 'exact' })
            .eq('user_id', user.id);
          
          // Count scan results for the latest scan job (if exists)
          // Note: creator_metrics doesn't have scan_job_id FK, so we count all metrics for user
          // This represents the scan results stored
          const scanResultsCount = metricsCount || 0;
          
          setDiagnostics({
            authUserId: user.id,
            profileExists: !!profileCheck,
            profileId: profileCheck?.id || null,
            latestScanJob: latestJob ? {
              id: latestJob.id,
              status: latestJob.status,
              progress: latestJob.progress,
              error: latestJob.error || null,
              error_message: latestJob.error || null, // Alias for consistency
              created_at: latestJob.created_at,
            } : null,
            socialAccountsCount: accountsCount || 0,
            socialAccounts: accounts || [],
            creatorMetricsCount: metricsCount || 0,
            scanResultsCount: scanResultsCount, // Count of scan results rows
            kitDataStatus: data.status,
            kitDataScanJobId: data.scanJobId,
          });

          // If scan job failed, fetch error message
          if (latestJob && latestJob.status === 'failed') {
            setScanJobError(latestJob.error || 'Unknown error');
          } else {
            setScanJobError(null);
          }
        }

        // Handle scanning state - poll for updates
        if (data.status === 'scanning' && data.scanJobId) {
          setScanning(true);
        } else {
          setScanning(false);
        }
      } catch (err) {
        console.error('[PublicMediaKit] Failed to fetch media kit data:', err);
        setKitData({
          profile: { name: null, username: null, niche: null, avatar_url: null, bio: null },
          platforms: [],
          stats: { audience: 0, avgViews: 0, engagement: 0 },
          topContent: [],
          suggestedRateRange: { min: 0, max: 0, currency: 'USD' },
          status: 'missing',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  // Separate useEffect for polling when scanning (e.g. after reconnect)
  useEffect(() => {
    if (!user || !kitData || kitData.status !== 'scanning' || !kitData.scanJobId) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/media-kit', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return;
        const updatedData: MediaKitData = await res.json();
        setKitData(updatedData);
        if (updatedData.status !== 'scanning') {
          clearInterval(pollInterval);
          setScanning(false);
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [user, kitData]);

  const router = useRouter();

  const username = kitData?.profile?.username || profile?.username || user?.email?.split('@')[0] || 'creator';
  const shareUrl = `exla.app/u/${username}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditName = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setNameValue(kitData?.profile?.name || profile?.name || username);
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!user || !nameValue.trim()) return;
    
    setSavingName(true);
    try {
      const trimmedName = nameValue.trim();
      
      // Get auth token for API call
      const { supabase } = await import('../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      // Use API route to bypass client-side schema cache issues
      const response = await fetch('/api/profile/update-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: trimmedName, userId: user.id }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save name');
      }
      
      // Update via OnboardingContext if available (for global state)
      // Note: updateProfile already refreshes local state, so refreshProfile is unnecessary
      if (onboardingContext?.updateProfile) {
        await onboardingContext.updateProfile({ name: trimmedName });
      }
      
      // Update local state immediately
      setProfile(prev => prev ? {
        ...prev,
        name: trimmedName,
      } : null);
      
      setEditingName(false);
    } catch (err: any) {
      console.error('Failed to save name:', err);
      alert(`Failed to save name: ${err.message || 'Please try again.'}`);
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameValue('');
  };

  const handleSyncNow = async () => {
    if (!user) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const { supabase } = await import('../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSyncError('Please sign in again');
        return;
      }
      const res = await fetch('/api/sync/youtube', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncError(json.error || 'Sync failed');
        return;
      }
      const mediaRes = await fetch('/api/media-kit', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setKitData(data);
      }
    } catch (e: any) {
      setSyncError(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshAnalysis = async () => {
    if (!user) return;
    console.log('refresh_analysis_clicked', { userId: user.id });
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const { supabase } = await import('../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setAnalysisError('Please sign in again');
        return;
      }
      const res = await fetch('/api/analyze/creator-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      console.log('refresh_analysis_response', { status: res.status, ok: res.ok, hasProfile: !!json.profile, error: json.error });
      if (!res.ok) {
        const msg = json.error || `Analysis failed (${res.status})`;
        setAnalysisError(msg);
        return;
      }
      const mediaRes = await fetch(`/api/media-kit?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setKitData(data);
        console.log('refresh_analysis_ui_updated', { hasAiProfile: !!data.aiProfile, headline: data.aiProfile?.headline?.slice(0, 30) });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('exla-refresh-user-data'));
        }
      } else {
        setAnalysisError('Profile saved but failed to refresh view. Pull to refresh.');
      }
    } catch (e: any) {
      const msg = e?.message || 'Analysis failed';
      setAnalysisError(msg);
      console.error('refresh_analysis_error', msg);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-gray-600">Please sign in to view your media kit</p>
        </div>
      </div>
    );
  }

  const displayName = kitData?.profile?.name || profile?.name || username;
  const displayNiche = kitData?.profile?.niche || creator?.niche || profile?.niche || inferredNiche || 'Tech creator';
  const primaryPlatform = profile?.primary_platform || kitData?.platforms?.[0]?.platform || 'youtube';
  const platformLabel = primaryPlatform === 'youtube' ? 'YouTube' : primaryPlatform === 'tiktok' ? 'TikTok' : primaryPlatform;
  const youtubeMetrics = kitData?.platforms?.find((p: any) => p.platform === 'youtube');
  const avgViews = kitData?.stats?.avgViews ?? youtubeMetrics?.avg_views_10 ?? 0;
  const hasAvgViews = avgViews > 0;
  const audience = kitData?.stats?.audience ?? 0;
  const engagement = kitData?.stats?.engagement ?? 0;
  const hasEngagement = engagement > 0;
  const updatedAt = kitData?.updatedAt ?? null;
  const aiProfile = kitData?.aiProfile ?? null;

  // Format numbers: exact below 1000, "1.2K" / "1.2M" when large
  const formatMediaKitCount = (n: number | undefined | null) => {
    const val = n ?? 0;
    if (val === 0) return null;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  // Generate "Why brands work with me" items
  const whyBrands = [
    displayNiche && displayNiche !== 'Creator' 
      ? `High-engagement audience of ${displayNiche.toLowerCase()}`
      : 'High-engagement audience',
    'Proven product-focused storytelling',
    'Consistent weekly publishing schedule',
  ].filter(Boolean);

  // Generate brand fit items from niche/topics
  const brandFit: string[] = [];
  if (displayNiche && displayNiche !== 'Creator' && displayNiche !== 'N/A') {
    if (displayNiche.toLowerCase().includes('tech') || displayNiche.toLowerCase().includes('developer')) {
      brandFit.push('Developer tools', 'SaaS products', 'Productivity software', 'Educational platforms');
    } else {
      const nicheBrands = displayNiche + ' brands';
      brandFit.push(nicheBrands, 'Product partnerships', 'Content collaborations');
    }
  } else {
    brandFit.push('Product partnerships', 'Content collaborations', 'Brand sponsorships');
  }

  const ACTION_BAR_HEIGHT = 140;

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] overflow-hidden">
      {/* Header - fixed height */}
      <div className="flex-shrink-0 bg-white px-6 py-4 border-b border-[rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-2 text-[#64748B]">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-[15px] font-semibold text-[#0F172A]">Media Kit</h2>
          <img 
            src="/brand/logo.png" 
            alt="Exla" 
            className="w-4 h-4 opacity-70"
          />
        </div>
        <p className="text-[10px] text-[#64748B] text-center mt-2 font-normal">
          Auto-generated with Exla
        </p>
      </div>

      {/* Scrollable content - flex-1 min-h-0 + overflow-y-auto so this area scrolls */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        style={{ paddingBottom: ACTION_BAR_HEIGHT + 24 }}
      >
      <div className="px-6 py-4 space-y-5">
        {/* Handle different states */}
        {kitData?.status === 'scanning' || scanning ? (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />
            <p className="text-sm text-gray-600">Scanning your account...</p>
            <div className="space-y-2">
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        ) : kitData?.status === 'missing' ? (
          <div className="py-8 text-center space-y-4">
            {diagnostics?.latestScanJob &&
             (diagnostics.latestScanJob.status === 'queued' || diagnostics.latestScanJob.status === 'running') ? (
              <div className="space-y-4">
                <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />
                <p className="text-sm text-gray-600">Scan in progress...</p>
                <Button
                  onClick={() => {
                    if (diagnostics.latestScanJob?.id) {
                      goOnboardingPush(router, 'scanning', `job=${diagnostics.latestScanJob.id}`);
                    }
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  View Progress
                </Button>
              </div>
            ) : scanJobError || (diagnostics?.latestScanJob && diagnostics.latestScanJob.status === 'failed') ? (
              <div className="space-y-3">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-semibold text-red-900 mb-1">Previous scan failed</p>
                  <p className="text-xs text-red-700">{scanJobError || diagnostics?.latestScanJob?.error || 'Unknown error'}</p>
                </div>
                <p className="text-sm text-gray-600">Connect a platform again from Home to regenerate your media kit.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Your media kit is generated from your connected platforms. Connect YouTube or TikTok from Home to see your kit here.
                </p>
                <Button variant="secondary" className="w-full" onClick={onClose}>
                  Back
                </Button>
              </div>
            )}
          </div>
        ) : kitData && kitData.status === 'ready' ? (
          <>
            {analysisError && (
              <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800" role="alert">
                <p className="font-semibold text-sm">Analysis failed</p>
                <p className="text-sm mt-1">{analysisError}</p>
                <button type="button" onClick={() => setAnalysisError(null)} className="text-xs underline mt-2">Dismiss</button>
              </div>
            )}
            {analyzing && (
              <div className="mb-4 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>Analyzing your content… Building headline, themes, and brand fit.</span>
              </div>
            )}
            {/* Hero Profile Card */}
            <Card variant="highlight">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-white text-[18px] font-semibold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nameValue}
                            onChange={(e) => setNameValue(e.target.value)}
                            className="text-[20px] font-semibold text-white bg-white/20 border border-white/30 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-white/50"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !savingName && nameValue.trim()) {
                                handleSaveName();
                              }
                              if (e.key === 'Escape') {
                                handleCancelEditName();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleSaveName}
                            disabled={savingName || !nameValue.trim()}
                            className="text-white hover:text-white/80 disabled:opacity-50"
                          >
                            {savingName ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditName}
                            disabled={savingName}
                            className="text-white/80 hover:text-white disabled:opacity-50"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-[20px] font-semibold text-white">
                            {displayName}
                          </h2>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEditName(e);
                            }}
                            className="p-1"
                          >
                            <Edit2 className="w-4 h-4 text-white/70" />
                          </button>
                        </>
                      )}
                    </div>
                    <p className="text-[13px] text-white/80">@{username}</p>
                  </div>
                </div>
              </div>
              <p className="text-[14px] text-white/95 leading-relaxed mb-3">
                {aiProfile?.headline ?? (displayNiche && displayNiche !== 'Creator' && displayNiche !== 'N/A'
                  ? (displayNiche.toLowerCase().endsWith('creator')
                      ? `${displayNiche} on ${platformLabel}`
                      : `${displayNiche} creator on ${platformLabel}`)
                  : `${platformLabel} creator`)}
              </p>
              <p className="text-[13px] text-white/90 font-medium">
                {hasAvgViews
                  ? `Avg views (last 10): ${formatMediaKitCount(avgViews) ?? '—'}`
                  : 'Connect and sync to see average views'}
              </p>
            </Card>

            {/* Stats Section */}
            <div>
              <SectionLabel className="mb-3">Audience & Reach</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-4 text-center min-h-[120px] flex flex-col justify-center">
                  <Users className="w-[22px] h-[22px] text-[#64748B] mx-auto mb-2" />
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {audience > 0 ? (formatMediaKitCount(audience) ?? '—') : 'Not available'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Subscribers</p>
                </div>
                <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-4 text-center min-h-[120px] flex flex-col justify-center">
                  <Eye className="w-[22px] h-[22px] text-[#64748B] mx-auto mb-2" />
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {hasAvgViews ? (formatMediaKitCount(avgViews) ?? '—') : 'Not available'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Avg views (last 10)</p>
                </div>
                <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-4 text-center min-h-[120px] flex flex-col justify-center relative">
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-[#0F172A] rounded text-[8px] text-white uppercase tracking-wider font-medium">Top metric</span>
                  <TrendingUp className="w-[22px] h-[22px] text-[#0F172A] mx-auto mb-2" />
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {hasEngagement ? `${Number(engagement).toFixed(1)}%` : 'Not available'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">Per view</p>
                </div>
              </div>
              {/* Last updated + Sync now */}
              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-[#64748B]">
                  {updatedAt
                    ? `Last updated ${new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Last updated —'}
                </p>
                <Button
                  variant="secondary"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="text-xs py-2"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    'Sync now'
                  )}
                </Button>
              </div>
              {syncError && (
                <p className="text-xs text-red-600 mt-2">{syncError}</p>
              )}
              {/* AI profile: Refresh analysis */}
              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-[#64748B]">
                  {aiProfile?.last_analysis_status === 'ok'
                    ? `Profile analyzed ${aiProfile.updated_at ? new Date(aiProfile.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}`
                    : aiProfile?.last_analysis_error
                      ? 'Profile analysis failed'
                      : 'AI creator profile'}
                </p>
                <Button
                  variant="ghost"
                  onClick={handleRefreshAnalysis}
                  disabled={analyzing}
                  className="text-xs py-2"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    'Refresh analysis'
                  )}
                </Button>
              </div>
              {analysisError && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">
                  <p className="font-medium">Analysis failed</p>
                  <p className="mt-1">{analysisError}</p>
                </div>
              )}
            </div>

            {/* About (AI bio) */}
            {aiProfile?.bio && (
              <div>
                <SectionLabel className="mb-3">About</SectionLabel>
                <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-5">
                  <p className="text-[14px] text-[#0F172A] leading-relaxed whitespace-pre-wrap">{aiProfile.bio}</p>
                </div>
              </div>
            )}

            {/* Content themes (AI) */}
            {aiProfile?.themes && aiProfile.themes.length > 0 && (
              <div>
                <SectionLabel className="mb-3">Content themes</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {aiProfile.themes.map((theme: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-[#F1F5F9] text-[13px] text-[#0F172A] rounded-full">
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Ideal brand partners (AI) */}
            {aiProfile?.brand_fit && aiProfile.brand_fit.length > 0 && (
              <div>
                <SectionLabel className="mb-3">Ideal brand partners</SectionLabel>
                <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-5">
                  <ul className="space-y-2">
                    {aiProfile.brand_fit.map((item: { category: string; reasoning?: string }, i: number) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-medium text-[#0F172A]">{item.category}</span>
                        {item.reasoning && (
                          <span className="text-[12px] text-[#64748B]">{item.reasoning}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Collab types (AI) */}
            {aiProfile?.suggested_collab_types && aiProfile.suggested_collab_types.length > 0 && (
              <div>
                <SectionLabel className="mb-3">Collab types</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {aiProfile.suggested_collab_types.map((type: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-[#EEF2FF] text-[13px] text-[#4338CA] rounded-full">
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* No AI profile yet - show CTA */}
            {!aiProfile?.headline && !analyzing && (
              <div className="bg-[#F8FAFC] border border-[rgba(15,23,42,0.06)] rounded-[14px] p-5">
                <p className="text-[13px] text-[#64748B] mb-3">Generating your creator profile… We analyze your content to build a headline, themes, and brand fit.</p>
                <Button variant="secondary" onClick={handleRefreshAnalysis} disabled={analyzing} className="text-sm">
                  {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</> : 'Refresh analysis'}
                </Button>
              </div>
            )}

            {/* Platforms - compact row */}
            {kitData.platforms && kitData.platforms.length > 0 && (
              <div>
                <SectionLabel className="mb-3">Platforms</SectionLabel>
                <div className="space-y-2">
                  {kitData.platforms.map((platform: any, i: number) => (
                    <div key={i} className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
                          platform.platform === 'youtube' ? 'bg-[#FF0000]' :
                          platform.platform === 'tiktok' ? 'bg-[#000000]' :
                          'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FD1D1D]'
                        }`}>
                          {platform.platform === 'youtube' ? (
                            <Youtube className="w-[22px] h-[22px] text-white" />
                          ) : platform.platform === 'tiktok' ? (
                            <span className="text-xl">🎵</span>
                          ) : (
                            <Instagram className="w-[22px] h-[22px] text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#0F172A]">
                            {platform.platform === 'youtube' ? 'YouTube' : platform.platform === 'tiktok' ? 'TikTok' : platform.platform}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#64748B]">
                            <span>{platform.followers != null && platform.followers > 0 ? `${formatMediaKitCount(platform.followers)} subscribers` : 'Not available'}</span>
                            <span>·</span>
                            <span>{platform.avg_views_10 != null && platform.avg_views_10 > 0 ? `${formatMediaKitCount(platform.avg_views_10)} avg views` : 'Not available'}</span>
                          </div>
                        </div>
                        {updatedAt && (
                          <p className="text-[10px] text-[#94A3B8] flex-shrink-0 hidden sm:block">
                            Updated {new Date(updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Why Brands Work With Me */}
            <div>
              <SectionLabel className="mb-3">Why brands work with me</SectionLabel>
              <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-5">
                <ul className="space-y-3">
                  {whyBrands.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#0F172A] mt-2 flex-shrink-0" />
                      <span className="text-[14px] text-[#0F172A] leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Brand Fit */}
            <div>
              <SectionLabel className="mb-3">Brand fit</SectionLabel>
              <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-5">
                <ul className="space-y-3">
                  {brandFit.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#0F172A] mt-2 flex-shrink-0" />
                      <span className="text-[14px] text-[#0F172A] leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Top Content - thumbnails derived from YouTube video_id (i.ytimg.com), no DB thumbnail */}
            {kitData.topContent && kitData.topContent.length > 0 && (
              <div>
                <SectionLabel className="mb-3">Top Content</SectionLabel>
                <div className="space-y-3">
                  {kitData.topContent.slice(0, 3).map((content: any, i: number) => {
                    const videoId = content.video_id ?? content.videoId ?? getYoutubeVideoId(content?.url);
                    const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
                    return (
                      <div key={i} className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] p-4">
                        <div className="flex gap-3">
                          <div className="w-24 h-16 rounded-[10px] flex-shrink-0 overflow-hidden bg-gray-100">
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover rounded-[10px]"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Youtube className="w-8 h-8 text-red-500" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-[14px] font-medium text-[#0F172A] mb-1 leading-snug line-clamp-2">
                              {content.title || 'Untitled'}
                            </p>
                            <p className="text-[12px] text-[#64748B]">
                              {content.views > 0 ? `${formatMediaKitCount(content.views)} views` : 'Not available'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
      </div>

      {/* Fixed bottom action bar - does not scroll */}
      {kitData && kitData.status === 'ready' && (
        <div className="flex-shrink-0 fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(15,23,42,0.08)] px-6 py-4 shadow-[0_-2px_10px_rgba(15,23,42,0.04)]">
          <div className="max-w-[390px] mx-auto">
            <p className="text-[12px] text-[#64748B] text-center mb-3">
              Available for partnerships
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={copyToClipboard}>
                <Copy className="w-4 h-4 mr-2" />
                Copy link
              </Button>
              <Button 
                variant="primary" 
                className="flex-1"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: 'Media Kit', url: shareUrl }).catch(() => {});
                  } else {
                    copyToClipboard();
                  }
                }}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Onboarding screens (simplified versions)
const ConnectAccount = ({ onConnect }: { onConnect: () => void }) => {
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Don't auto-setup or auto-connect
  // OnboardingGuard will handle routing for authenticated users
  // This component only shows welcome screen for unauthenticated users
  
  // If user is authenticated, OnboardingGuard will redirect them
  // So we should never see this component for authenticated users
  // But if we do, show a loading state
  if (user) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="h-full w-full flex flex-col items-center justify-center px-6 text-center overflow-hidden"
        style={{
          background: 'linear-gradient(to bottom, #fafafa 0%, #ffffff 100%)',
          paddingTop: 'max(2rem, env(safe-area-inset-top, 2rem))',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))',
        }}
      >
        <div className="w-full max-w-[340px] mx-auto space-y-8">
          {/* outline outline-1 outline-red-500/20 */}
          <div className="text-center space-y-6">
            <div className="flex justify-center items-center">
              <ExlaLogo size={56} />
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                Welcome to Exla
              </h1>
              <p className="text-base text-gray-500 font-normal">
                Your AI Manager for Brand Deals
              </p>
            </div>
          </div>
          <div className="pt-4">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          </div>
        </div>
      </div>
    );
  }


  if (!user) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="w-full max-w-sm px-6 pb-28 text-center animate-welcome-entrance">
            {/* Logo and Headline Group */}
            <div className="flex flex-col gap-6 items-center w-full mb-10">
              {/* Logo - explicitly centered */}
              <div className="flex justify-center items-center">
                <ExlaLogo size={56} />
              </div>
              
              {/* Headline and Subtitle */}
              <div className="flex flex-col gap-3 items-center w-full">
                <h1 className="text-4xl font-bold text-gray-900 tracking-tight text-center w-full">
                  Welcome to Exla
                </h1>
                <p className="text-base text-gray-500 font-normal text-center w-full">
                  Your AI Manager for Brand Deals
                </p>
              </div>
            </div>

            {/* Actions Group - all centered, same width */}
            <div className="w-full flex flex-col gap-3 items-center">
              <a href="/auth/login" className="w-full">
                <button
                  className="w-full px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-transform duration-150 active:scale-[0.99]"
                >
                  Sign In
                </button>
              </a>
              
              <a href="/onboarding/welcome" className="w-full">
                <button
                  className="w-full px-5 py-3.5 bg-white border-2 border-gray-200 text-gray-900 font-semibold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-transform duration-150 active:scale-[0.99] shadow-sm"
                >
                  Create Account
                </button>
              </a>
              
              {/* Trust Cue - centered */}
              <p className="text-xs text-gray-400 text-center pt-2 w-full">
                Used by creators to land brand deals
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connect social account option
  const handleConnectAccount = async () => {
    try {
      // Ensure user is ready
      if (!user) {
        setError("Please sign in first");
        return;
      }
      
      // Open the connection UI (redirect to home where ConnectSocialsPanel is visible)
      window.location.href = '/';
    } catch (err) {
      console.error("Failed to open connection UI:", err);
      setError("Failed to open connection options. Please try again.");
    }
  };

  return (
    <div className="h-full w-full bg-white flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="w-full space-y-8">
        <div className="text-center">
          <ExlaLogo size={48} />
          <h1 className="text-3xl font-bold text-gray-900 mt-6 mb-2">Connect Your Account</h1>
          <p className="text-gray-600">Connect a social account to get started</p>
        </div>
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
          <Button 
            onClick={handleConnectAccount}
            fullWidth
            className="flex items-center justify-center gap-2"
          >
            Connect a social account
          </Button>
          <p className="text-xs text-gray-500 text-center">
            We'll scan your account to build your creator profile and personalize matches
          </p>
        </div>
      </div>
    </div>
  );
};

// Connect Socials Panel Component
const ConnectSocialsPanel = ({ userId }: { userId: string }) => {
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  // Load collapsed state from localStorage on mount - default to false (expanded)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('connectSocialsCollapsed');
      if (stored !== null) {
        setCollapsed(JSON.parse(stored));
      } else {
        // Default to expanded if no value in localStorage
        setCollapsed(false);
      }
    }
  }, []);

  // Save collapsed state to localStorage and handle forced expansion when 0 connected
  const toggleCollapse = () => {
    let newState = !collapsed;
    
    // If trying to collapse when 0 connected, prevent it (force expanded)
    if (newState === true && connectedCount === 0) {
      newState = false;
    }
    
    setCollapsed(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('connectSocialsCollapsed', JSON.stringify(newState));
    }
  };

  const checkConnections = async () => {
    try {
      const { supabase } = await import('../lib/supabaseClient');
      
      // Check all platforms in parallel
      const [youtubeResult, tiktokResult] = await Promise.all([
        supabase
          .from('social_accounts')
          .select('platform')
          .eq('user_id', userId)
          .eq('platform', 'youtube')
          .maybeSingle(),
        supabase
          .from('social_accounts')
          .select('platform')
          .eq('user_id', userId)
          .eq('platform', 'tiktok')
          .maybeSingle(),
      ]);

      const youtubeConnected = !!youtubeResult.data;
      const tiktokConnected = !!tiktokResult.data;
      
      setYoutubeConnected(youtubeConnected);
      setTiktokConnected(tiktokConnected);
      
      // Count total connected platforms
      const { data: allAccounts } = await supabase
        .from('social_accounts')
        .select('platform')
        .eq('user_id', userId);
      
      const count = allAccounts?.length || 0;
      setConnectedCount(count);
    } catch (err) {
      console.error('Error checking connections:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check connections on mount and when userId changes
  useEffect(() => {
    if (userId) {
      checkConnections();
    }
  }, [userId]);

  // Refresh connections when returning from OAuth (listen for focus/visibility change)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && userId) {
        checkConnections();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userId]);

  // Force expanded if 0 connected
  useEffect(() => {
    if (connectedCount === 0 && collapsed) {
      setCollapsed(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('connectSocialsCollapsed', JSON.stringify(false));
      }
    }
  }, [connectedCount, collapsed]);

  const handleConnectPlatform = (platform: string) => {
    if (platform === 'youtube') {
      window.location.href = `/api/oauth/youtube/start?userId=${userId}`;
    } else if (platform === 'tiktok') {
      window.location.href = `/api/oauth/tiktok/start?userId=${userId}`;
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 space-y-4">
      <button
        type="button"
        onClick={toggleCollapse}
        className="flex items-start justify-between w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">
              {collapsed ? `${connectedCount} of 3 platforms connected` : 'Connect Your Social Accounts'}
            </h3>
            {!collapsed && connectedCount > 0 && (
              <span className="text-xs text-gray-500">({connectedCount} / 3 connected)</span>
            )}
          </div>
          {!collapsed && (
            <p className="text-xs text-gray-600">
              We scan your account to build your media kit and personalize the app.
            </p>
          )}
        </div>
        <ChevronRight 
          size={16} 
          className={`text-gray-400 transition-transform flex-shrink-0 ml-2 ${collapsed ? '' : 'rotate-90'}`} 
        />
      </button>

      {!collapsed && (
        <div className="grid grid-cols-3 gap-3">
        {/* YouTube Card */}
        <div className={`bg-white rounded-lg p-3 border ${youtubeConnected ? 'border-green-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Youtube size={18} className={youtubeConnected ? 'text-red-600' : 'text-gray-400'} />
            <span className="text-xs font-medium text-gray-900">YouTube</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {loading ? (
                <Loader2 size={12} className="animate-spin text-gray-400" />
              ) : youtubeConnected ? (
                <>
                  <CheckCircle2 size={12} className="text-green-600" />
                  <span className="text-xs text-green-700">Connected</span>
                </>
              ) : (
                <span className="text-xs text-gray-500">Not connected</span>
              )}
            </div>
            <Button
              onClick={() => handleConnectPlatform('youtube')}
              disabled={loading || youtubeConnected}
              variant={youtubeConnected ? "secondary" : "primary"}
              className="w-full text-xs py-1.5"
            >
              {youtubeConnected ? 'Connected' : 'Connect'}
            </Button>
          </div>
        </div>

        {/* TikTok Card */}
        <div className={`bg-white rounded-lg p-3 border ${tiktokConnected ? 'border-green-200' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <svg className={`w-[18px] h-[18px] ${tiktokConnected ? 'text-gray-900' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            <span className="text-xs font-medium text-gray-900">TikTok</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {loading ? (
                <Loader2 size={12} className="animate-spin text-gray-400" />
              ) : tiktokConnected ? (
                <>
                  <CheckCircle2 size={12} className="text-green-600" />
                  <span className="text-xs text-green-700">Connected</span>
                </>
              ) : (
                <span className="text-xs text-gray-500">Not connected</span>
              )}
            </div>
            <Button
              onClick={() => handleConnectPlatform('tiktok')}
              disabled={loading || tiktokConnected}
              variant={tiktokConnected ? "secondary" : "primary"}
              className="w-full text-xs py-1.5"
            >
              {tiktokConnected ? 'Connected' : 'Connect'}
            </Button>
          </div>
        </div>

        {/* Instagram Card */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 opacity-60">
          <div className="flex items-center gap-2 mb-2">
            <Instagram size={18} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Instagram</span>
          </div>
          <div className="space-y-2">
            <span className="text-xs text-gray-400">Coming soon</span>
            <Button
              disabled
              variant="secondary"
              className="w-full text-xs py-1.5"
            >
              Coming soon
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

// Connect Platforms screen (gate): shown when user has no connected platforms
const ConnectPlatformsScreen = () => {
  const { user } = useAuth();
  const userData = useUserData();

  // Refetch when returning from OAuth so gate can re-check and show app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.id) {
        userData.refreshSilently();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, userData]);

  return (
    <div className="flex flex-col h-full w-full bg-white p-6 pt-16">
      <p className="text-[15px] text-[#64748B] mb-6">
        Connect at least one account to personalize your experience.
      </p>
      <ConnectSocialsPanel userId={user?.id ?? ''} />
    </div>
  );
};

// Gate: show Connect until at least one platform is connected; otherwise show main app tabs
const AppGate = ({ tabContent }: { tabContent: React.ReactNode }) => {
  const userData = useUserData();
  const stillLoading = userData.socialAccounts === null;
  const hasConnectedPlatform = (userData.socialAccounts?.length ?? 0) > 0;

  if (stillLoading) {
    return (
      <div className="h-full w-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }
  if (!hasConnectedPlatform) {
    return <ConnectPlatformsScreen />;
  }
  return <>{tabContent}</>;
};

// Creator Home - Mobile-first, action-driven redesign
const CreatorHome = ({ onNavigate, onShowNotifications, onShowMediaKit }: { onNavigate: (tab: string) => void; onShowNotifications: () => void; onShowMediaKit?: () => void }) => {
  const { user } = useAuth();
  const userData = useUserData();
  const creatorAiProfile = userData.creatorAiProfile;
  const { profile: onboardingProfile } = useOnboarding();
  const [xp, setXp] = useState(150);
  const [weeklyStreak, setWeeklyStreak] = useState(3);
  const [objectives, setObjectives] = useState<Array<{ id: number; text: string; xp: number; completed: boolean }>>([]);
  const [suggestedRate, setSuggestedRate] = useState<{ min: number; max: number } | null>(null);
  const [showSocialConnect, setShowSocialConnect] = useState(false);
  const [userName, setUserName] = useState<string>('');

  // Use data from store
  const creatorMetrics = userData.creatorMetrics || [];
  const brandRecommendationsCount = userData.brandRecommendationsCount;
  const pitchesCount = {
    draft: userData.pitchesCounts.draft,
    sent: userData.pitchesCounts.sent,
    replied: userData.pitchesCounts.replied,
    total: userData.pitchesCounts.total,
  };
  const connectedPlatforms = (userData.socialAccounts || []).map(a => a.platform);
  const creatorProfile = userData.creatorProfile;
  const followups = userData.followups || [];

  // Handle TikTok connection success notification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tiktok_connected') === 'true') {
        console.log('✅ TikTok connected - refreshing user data...');
        // Refresh user data to show TikTok as connected
        userData.refreshSilently();
        // Also force a full refresh to ensure UI updates
        setTimeout(() => {
          userData.refresh();
        }, 500);
        // Clean URL after a short delay
        setTimeout(() => {
          window.history.replaceState({}, '', window.location.pathname);
        }, 1000);
      }
      const error = params.get('error');
      if (error && error.includes('TikTok')) {
        // Show error notification if needed
        console.error('❌ TikTok connection error:', decodeURIComponent(error));
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [userData]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedXP = parseInt(localStorage.getItem('exla_creator_xp') || '150');
      const storedStreak = parseInt(localStorage.getItem('exla_weekly_streak') || '3');
      const storedObjectives = localStorage.getItem('exla_daily_objectives');
      const parsed = storedObjectives ? JSON.parse(storedObjectives) : {};
      
      setXp(storedXP);
      setWeeklyStreak(storedStreak);
      setObjectives([
        { id: 1, text: 'Send 1 pitch', xp: 25, completed: parsed['1'] || false },
        { id: 2, text: 'Respond to brand inquiry', xp: 15, completed: parsed['2'] || false },
        { id: 3, text: 'Update media kit', xp: 10, completed: parsed['3'] || false }
      ]);
    }
  }, []);

  // Calculate suggested rate when metrics change
  useEffect(() => {
    if (creatorMetrics.length > 0) {
      const youtubeMetrics = creatorMetrics.find(m => m.platform === 'youtube');
      if (youtubeMetrics) {
        const avgViews = youtubeMetrics.avg_views_10 || 0;
        const followers = youtubeMetrics.followers || 0;
        // Rough estimate: $0.01-0.05 per view or $1-5 per 1000 followers
        const rateFromViews = Math.floor(avgViews * 0.01);
        const rateFromFollowers = Math.floor(followers * 0.001);
        const minRate = Math.max(10, Math.min(rateFromViews, rateFromFollowers));
        const maxRate = Math.floor(minRate * 2.5);
        setSuggestedRate({ min: minRate, max: maxRate });
      }
    }
  }, [creatorMetrics]);

  // Hide the social connect section when all platforms are connected
  useEffect(() => {
    if (connectedPlatforms.length >= 3) {
      setShowSocialConnect(false); // Hide when all connected
    }
  }, [connectedPlatforms.length]);

  // Fetch creator profile if needed (legacy)
  useEffect(() => {
    if (!user || creatorProfile) return;

    const fetchProfile = async () => {
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { data: profile } = await supabase
          .from('creator_profiles')
          .select('size_tier, primary_topics')
          .eq('user_id', user.id)
          .single();
        // Profile is now in store, no need to set local state
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      }
    };

    // Only fetch profile if store doesn't have it
    if (user && !creatorProfile) {
      fetchProfile();
    }
  }, [user, creatorProfile]);

  // Fetch user name for welcome message
  useEffect(() => {
    const fetchUserName = async () => {
      if (!user) return;
      try {
        const { supabase } = await import('../lib/supabaseClient');
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.name) {
          setUserName(profile.name);
        } else if (onboardingProfile?.name) {
          setUserName(onboardingProfile.name);
        } else {
          setUserName(user.email?.split('@')[0] || 'Creator');
        }
      } catch (err) {
        console.error('Failed to fetch user name:', err);
        setUserName(user.email?.split('@')[0] || 'Creator');
      }
    };
    fetchUserName();
  }, [user, onboardingProfile]);

  // Creator Snapshot: same source as Profile (userData.creatorMetrics)
  const youtubeMetrics = creatorMetrics.find(m => m.platform === 'youtube');
  const hasMetrics = youtubeMetrics && (
    (youtubeMetrics.followers ?? 0) > 0 ||
    (youtubeMetrics.avg_views_10 ?? 0) > 0 ||
    (youtubeMetrics.engagement_rate_10 ?? 0) > 0
  );
  const engagementRate = youtubeMetrics?.engagement_rate_10 ?? 0;
  // Format like Profile: show actual number; use "X.XK" only when >= 1000
  const formatCount = (n: number | undefined | null) => {
    const val = n ?? 0;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };
  
  // Calculate rate range
  const rateRange = suggestedRate ? `$${(suggestedRate.min / 1000).toFixed(1)}K–$${(suggestedRate.max / 1000).toFixed(1)}K per post` : null;

  return (
    <div className="min-h-screen bg-white pb-28">
      <div className="px-6 pt-16 pb-6">
        <h1 className="text-[28px] font-semibold text-[#0F172A] mb-1">
          Welcome back
        </h1>
        <p className="text-[15px] text-[#64748B]">
          {userName || 'Creator'}
        </p>
      </div>

      <div className="px-6 space-y-8">
        {/* Primary Focus Block */}
        <div className="bg-[#F8F9FB] rounded-[16px] p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-[0.06em] mb-2">
                Your next step
              </p>
              <h3 className="text-[16px] font-semibold text-[#0F172A] mb-1">
                Generate brand matches
              </h3>
              <p className="text-[13px] text-[#64748B]">
                Recommended next step
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const hasAny = (userData.socialAccounts?.length ?? 0) > 0;
              if (!hasAny) return; // Gate keeps them off Home until connected; no-op if somehow here
              onNavigate('discover');
            }}
            className="flex items-center gap-2 text-[14px] font-semibold text-[#0F172A] mt-3"
          >
            Start now
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Your creator profile (AI) - personalization from creator_ai_profiles */}
        {creatorAiProfile && onShowMediaKit && (
          <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[16px] p-5">
            <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-[0.06em] mb-2">Your creator profile</p>
            <p className="text-[15px] font-medium text-[#0F172A] mb-2">
              {creatorAiProfile?.headline ?? 'Profile ready — view in Media Kit'}
            </p>
            {onShowMediaKit && (
              <button
                type="button"
                onClick={onShowMediaKit}
                className="text-[13px] font-medium text-indigo-600"
              >
                View media kit →
              </button>
            )}
          </div>
        )}

        {/* Connected Platforms: connect dropdown (YouTube, TikTok, Instagram coming soon) */}
        <div>
          <SectionLabel className="mb-4">Connected Platforms</SectionLabel>
          <ConnectSocialsPanel userId={user?.id ?? ''} />
        </div>

        {/* Creator Snapshot */}
        {hasMetrics && youtubeMetrics && (
          <div>
            <SectionLabel className="mb-4">Creator Snapshot</SectionLabel>
            <div className="bg-[#F8F9FB] rounded-[16px] p-5">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-[22px] h-[22px] text-[#64748B]" />
                  </div>
                  <p className="text-[11px] text-[#64748B] uppercase tracking-[0.06em] mb-1">Subscribers</p>
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {formatCount(youtubeMetrics.followers)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-[22px] h-[22px] text-[#64748B]" />
                  </div>
                  <p className="text-[11px] text-[#64748B] uppercase tracking-[0.06em] mb-1">Avg Views</p>
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {formatCount(youtubeMetrics.avg_views_10)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-[22px] h-[22px] text-[#64748B]" />
                  </div>
                  <p className="text-[11px] text-[#64748B] uppercase tracking-[0.06em] mb-1">Engagement</p>
                  <p className="text-[20px] font-semibold text-[#0F172A]">
                    {engagementRate > 0 ? `${engagementRate.toFixed(2)}%` : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-3 border-t border-[rgba(15,23,42,0.06)]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[12px] text-[#64748B]">Same data as Profile · updates together</p>
              </div>
            </div>
          </div>
        )}

        {/* Next Actions */}
        <div>
          <SectionLabel className="mb-4">Next Actions</SectionLabel>
          <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] divide-y divide-[rgba(15,23,42,0.06)]">
            <div className="px-4">
              <ListRow
                icon={FileText}
                iconBg="bg-[#F8FAFC]"
                iconColor="text-[#0F172A]"
                title="Update your media kit"
                showChevron
                onClick={() => onNavigate('profile')}
              />
            </div>
            <div className="px-4">
              <ListRow
                icon={Sparkles}
                iconBg="bg-[#F8FAFC]"
                iconColor="text-[#0F172A]"
                title="Generate brand matches"
                showChevron
                onClick={() => onNavigate('discover')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper to parse deal type and attainability reason from suggested_pitch_angle
const parsePitchMetadata = (pitchAngle: string) => {
  const dealMatch = pitchAngle.match(/\[DEAL:(\w+)\]/);
  const reasonMatch = pitchAngle.match(/\[REASON:(.+?)\]\s*/);
  
  const dealType = dealMatch ? dealMatch[1] : null;
  const attainabilityReason = reasonMatch ? reasonMatch[1] : null;
  const cleanPitchAngle = pitchAngle
    .replace(/\[DEAL:\w+\]\s*/g, '')
    .replace(/\[REASON:.+?\]\s*/g, '')
    .trim();

  return { dealType, attainabilityReason, cleanPitchAngle };
};

// Comprehensive list of disallowed large brands for nano/micro creators (must match API)
const DISALLOWED_BRANDS = [
  // Gaming
  'Epic Games', 'Razer', 'Nintendo', 'PlayStation', 'Xbox', 'Steam', 'Valve', 'Activision', 'Electronic Arts', 'EA', 'Ubisoft',
  // Tech giants
  'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Facebook', 'Instagram', 'TikTok', 'Twitter', 'X',
  // Retail/Commerce
  'Walmart', 'Target', 'Best Buy', 'Costco',
  // Entertainment
  'Disney', 'Netflix', 'Warner Bros', 'Sony Pictures', 'Paramount',
  // Food & Beverage
  'Coca-Cola', 'Pepsi', 'McDonald\'s', 'Starbucks', 'KFC', 'Pizza Hut', 'Domino\'s', 'Taco Bell', 'Subway',
  // Energy drinks
  'Red Bull', 'Monster Energy', 'Rockstar Energy',
  // Fashion/Sportswear
  'Nike', 'Adidas', 'Puma', 'Under Armour', 'Reebok',
  // VPN/Tech services
  'NordVPN', 'ExpressVPN', 'Surfshark', 'McAfee', 'Norton',
  // Specific gaming titles that are too big
  'Raid: Shadow Legends', 'Call of Duty', 'Fortnite', 'PUBG', 'Minecraft', 'Roblox',
  // Other mega brands
  'Samsung', 'LG', 'Sony', 'Canon', 'Nikon', 'Dell', 'HP', 'Lenovo', 'Intel', 'AMD', 'NVIDIA',
];

// Helper to check if a brand is disallowed (case-insensitive)
const isDisallowedBrand = (brandName: string): boolean => {
  const normalized = brandName.toLowerCase();
  return DISALLOWED_BRANDS.some(disallowed => {
    const disallowedLower = disallowed.toLowerCase();
    return normalized.includes(disallowedLower) || disallowedLower.includes(normalized);
  });
};

// Helper to estimate brand size from domain/website
const estimateBrandSize = (brand: any): { size: 'Micro' | 'Small' | 'Medium'; estimated: boolean } => {
  // Try to infer from domain if available
  const domain = brand.domain || '';
  const website = brand.website || '';
  const snippet = brand.snippet || '';
  
  // Check for indicators of larger brands
  const hasLargeIndicators = domain.includes('amazon.com') || 
    domain.includes('shopify') || 
    snippet.toLowerCase().includes('million') ||
    snippet.toLowerCase().includes('global') ||
    snippet.toLowerCase().includes('enterprise');
  
  // Check for small/micro indicators
  const hasSmallIndicators = domain.includes('.shop') ||
    snippet.toLowerCase().includes('small') ||
    snippet.toLowerCase().includes('indie') ||
    snippet.toLowerCase().includes('startup') ||
    snippet.toLowerCase().includes('niche');
  
  if (hasLargeIndicators) {
    return { size: 'Medium', estimated: true };
  } else if (hasSmallIndicators) {
    return { size: 'Micro', estimated: true };
  }
  
  // Default based on deal type (affiliate/gifted suggests smaller)
  if (brand.deal_type === 'affiliate' || brand.deal_type === 'gifted') {
    return { size: 'Small', estimated: true };
  }
  
  return { size: 'Small', estimated: true };
};

// Helper to calculate response likelihood
const calculateResponseLikelihood = (
  brand: any,
  sizeTier: 'nano' | 'micro' | 'mid' | 'large',
  dealType?: string
): 'High' | 'Medium' | 'Low' => {
  let score = 0;
  
  // Creator size factor (smaller creators have lower base likelihood)
  if (sizeTier === 'nano') score = 40;
  else if (sizeTier === 'micro') score = 55;
  else if (sizeTier === 'mid') score = 70;
  else score = 85;
  
  // Deal type factor (affiliate/gifted programs are more likely to respond)
  if (dealType === 'affiliate') score += 25;
  else if (dealType === 'gifted') score += 15;
  else if (dealType === 'paid') {
    // Paid is less likely for nano/micro
    if (sizeTier === 'nano' || sizeTier === 'micro') {
      score -= 10;
    } else {
      score += 5;
    }
  }
  
  // Brand size factor (smaller brands are more likely to respond to small creators)
  const brandSizeEstimate = estimateBrandSize(brand);
  if (sizeTier === 'nano' || sizeTier === 'micro') {
    if (brandSizeEstimate.size === 'Micro') score += 20;
    else if (brandSizeEstimate.size === 'Small') score += 10;
    else score -= 15; // Medium brands less likely
  }
  
  // Niche alignment factor (if attainability reason suggests good fit)
  if (brand.attainability_reason && brand.attainability_reason.toLowerCase().includes('nano') || 
      brand.attainability_reason.toLowerCase().includes('micro')) {
    score += 10;
  }
  
  // Confidence factor (higher confidence suggests better match)
  if (brand.confidence) {
    if (brand.confidence >= 75) score += 5;
    else if (brand.confidence < 50) score -= 10;
  }
  
  // Cap and categorize
  score = Math.max(0, Math.min(100, score));
  
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
};

// Creator Discover with Pitch Flow - Real data only
const CreatorDiscover = () => {
  const { user } = useAuth();
  const userData = useUserData();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showPitchModal, setShowPitchModal] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [sizeTier, setSizeTier] = useState<'nano' | 'micro' | 'mid' | 'large'>('nano');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [expandedPitchAngles, setExpandedPitchAngles] = useState<Set<string>>(new Set());
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());
  const [copiedContactId, setCopiedContactId] = useState<string | null>(null);
  const [showWhyMatches, setShowWhyMatches] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenMode, setRegenMode] = useState<'replace' | 'keep'>('replace');
  const [rememberChoice, setRememberChoice] = useState(true);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStep, setJobStep] = useState<string | null>(null);
  const [jobLog, setJobLog] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  
  // MOVED: Parse and filter recommendations state - must be before any non-hook code
  const [parsedRecommendations, setParsedRecommendations] = useState<any[]>([]);
  
  // MOVED: Brand contacts state - must be before any non-hook code
  const [brandContacts, setBrandContacts] = useState<Record<string, { 
    contacts: Array<{ type: string; label: string; value: string; icon: any }>;
    status: 'complete' | 'pending' | 'failed' | 'none';
    error?: string;
    website_url?: string | null;
    contact_page_url?: string | null;
  }>>({});
  
  // MOVED: Enriching brands state - must be before any non-hook code
  const [enrichingBrands, setEnrichingBrands] = useState<Set<string>>(new Set());
  
  // Status messages (rotate every ~2 seconds)
  const statusMessages = [
    "Scanning brands that work with nano creators…",
    "Filtering out brands unlikely to respond…",
    "Prioritizing affiliate + gifted opportunities…",
    "Ranking by response likelihood…",
    "Finalizing your matches…",
  ];

  // Tips (rotate every ~6 seconds, plain text with emoji)
  const influencerTips = [
    "💡 Affiliate deals close faster than paid sponsorships for nano creators.",
    "💡 Mention avg views, not follower count, in your pitch.",
    "💡 Server hosting brands respond well to Minecraft creators.",
    "💡 Focus on 1-2 niches. Brands prefer creators who specialize.",
    "💡 Include your engagement rate in pitches. High engagement beats high follower count.",
    "💡 Follow up after 3-5 days. Most brands are busy and need reminders.",
  ];

  // Load saved regen mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('regenMode');
      const savedRemember = localStorage.getItem('regenRememberChoice');
      if (saved === 'replace' || saved === 'keep') {
        setRegenMode(saved);
      }
      if (savedRemember === 'false') {
        setRememberChoice(false);
      }
    }
  }, []);

  // Save regen mode to localStorage when it changes
  const handleRegenModeChange = (mode: 'replace' | 'keep') => {
    setRegenMode(mode);
    if (rememberChoice && typeof window !== 'undefined') {
      localStorage.setItem('regenMode', mode);
    }
  };

  const handleRememberChoiceChange = (remember: boolean) => {
    setRememberChoice(remember);
    if (typeof window !== 'undefined') {
      localStorage.setItem('regenRememberChoice', remember.toString());
      if (remember) {
        localStorage.setItem('regenMode', regenMode);
      }
    }
  };

  // Use data from store - ensure recommendations is always an array to prevent hooks order changes
  const recommendations = Array.isArray(userData.brandRecommendations) ? userData.brandRecommendations : [];
  const creatorMetrics = userData.creatorMetrics?.find(m => m.platform === 'youtube') || null;
  const creatorProfile = userData.creatorProfile;
  const loading = userData.loading && recommendations.length === 0 && !userData.brandRecommendations;
  const connectedPlatforms = getConnectedPlatforms(userData.socialAccounts);

  // Loading messages for the animated loader
  const loadingMessages = [
    "Reading your channel…",
    "Searching brand programs…",
    "Filtering to nano-friendly…",
    "Scoring response likelihood…",
    "Finalizing your matches…",
  ];

  // Rotate loading messages when generating
  useEffect(() => {
    if (!generating) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 1800); // Rotate every ~1.8 seconds

    return () => clearInterval(interval);
  }, [generating, loadingMessages.length]);

  // Determine if user has metrics (from store)
  const hasMetrics = (userData.socialAccounts && userData.socialAccounts.length > 0) || 
                     (userData.creatorMetrics && userData.creatorMetrics.length > 0);

  // Update size tier from store data
  useEffect(() => {
    if (creatorProfile?.size_tier) {
      setSizeTier(creatorProfile.size_tier as 'nano' | 'micro' | 'mid' | 'large');
    } else if (creatorMetrics) {
      const followers = creatorMetrics.followers || 0;
      const sizeMetric = followers > 0 ? followers : Math.floor((creatorMetrics.avg_views_10 || 0) / 10);
      
      if (sizeMetric >= 100000) {
        setSizeTier('large');
      } else if (sizeMetric >= 10000) {
        setSizeTier('mid');
      } else if (sizeMetric >= 1000) {
        setSizeTier('micro');
      } else {
        setSizeTier('nano');
      }
    }
  }, [creatorProfile, creatorMetrics]);

  const handleGenerate = async (regenerate = false) => {
    if (!user) return;
    
    // Fix: If regenerate is an event object, treat it as false
    const isEvent = regenerate && typeof regenerate === 'object' && 'target' in regenerate && 'type' in regenerate;
    const shouldRegenerate = regenerate === true && !isEvent;
    
    setGenerating(true);
    setRegenerateError(null);
    setJobStep(null);
    setJobLog([]);
    setJobId(null);
    setCurrentTipIndex(0);
    
    try {
      const response = await fetch('/api/brands/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.id,
          mode: shouldRegenerate ? regenMode : 'replace',
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to generate recommendations');
      }

      // Store jobId for polling (useEffect will handle polling)
      if (responseData.jobId) {
        console.log('[Frontend] Received jobId:', responseData.jobId);
        setJobId(responseData.jobId);
        // Polling will start via useEffect when jobId is set
      } else {
        // Fallback: if no jobId, assume it completed immediately (old behavior)
        await userData.invalidateBrandRecommendations();
        setShowRegenerateModal(false);
        setRegenerateError(null);
        setGenerating(false);
      }
    } catch (err: any) {
      console.error('Failed to generate recommendations:', err);
      setRegenerateError(err.message || 'Failed to generate recommendations. Please try again.');
      setGenerating(false);
    }
  };

  // Poll job status with useEffect
  useEffect(() => {
    if (!jobId || !user || !generating) {
      console.log('[Frontend] Polling skipped:', { jobId: !!jobId, user: !!user, generating });
      return;
    }

    console.log('[Frontend] Starting polling for job:', jobId);

    // Immediate first poll
    const doPoll = async () => {
      try {
        const response = await fetch(`/api/brands/status?jobId=${jobId}&userId=${user.id}`);
        const data = await response.json();

        if (response.ok && data) {
          console.log(`[Frontend] Poll result for ${jobId}:`, { step: data.step, status: data.status });
          setJobStep(data.step || null);
          if (data.log && Array.isArray(data.log)) {
            setJobLog(data.log);
          }

          if (data.status === 'complete' && data.progress === 100) {
            clearInterval(pollInterval);
            // Refresh recommendations
            await userData.invalidateBrandRecommendations();
            // Close modal after a brief delay to show completion
            setTimeout(() => {
              setShowRegenerateModal(false);
              setRegenerateError(null);
              setGenerating(false);
              setJobId(null);
              setJobStep(null);
              setJobLog([]);
            }, 500);
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            setRegenerateError(data.error || 'Generation failed. Please try again.');
            setGenerating(false);
          }
        } else {
          // If job not found or error, stop polling
          clearInterval(pollInterval);
          setRegenerateError('Failed to track progress. Please try again.');
          setGenerating(false);
        }
      } catch (err) {
        console.error('[Frontend] Error polling job status:', err);
        // Continue polling on error (might be transient)
      }
    };

    // Do immediate poll
    doPoll();

    const pollInterval = setInterval(doPoll, 500); // Poll every 500ms

    // Rotate tips every 6 seconds
    const tipInterval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % influencerTips.length);
    }, 6000);

    // Rotate status messages every 2 seconds
    const statusInterval = setInterval(() => {
      setCurrentStatusIndex(prev => (prev + 1) % statusMessages.length);
    }, 2000);

      // Cleanup on unmount or when dependencies change
      return () => {
        clearInterval(pollInterval);
        clearInterval(tipInterval);
        clearInterval(statusInterval);
      };
    }, [jobId, user?.id, generating, userData, influencerTips.length, statusMessages.length]);

  // Reset progress state when modal closes
  useEffect(() => {
    if (!showRegenerateModal) {
      setJobId(null);
      setJobStep(null);
      setJobLog([]);
      setRegenerateError(null);
      setCurrentStatusIndex(0);
      setCurrentTipIndex(0);
    }
  }, [showRegenerateModal]);

  const handleSave = async (id: string) => {
    if (!user) return;
    
    setSaving(id);
    try {
      const { supabase } = await import('../lib/supabaseClient');
      const { error } = await supabase
        .from('brand_recommendations')
        .update({ status: 'saved' })
        .eq('id', id)
        .eq('user_id', user.id);

      if (!error) {
        await userData.invalidateBrandRecommendations();
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(null);
    }
  };

  const handleIgnore = async (id: string) => {
    if (!user) return;
    
    setIgnoring(id);
    try {
      const { supabase } = await import('../lib/supabaseClient');
        const { error } = await supabase
          .from('brand_recommendations')
          .update({ status: 'ignored' })
          .eq('id', id)
          .eq('user_id', user.id);

      if (!error) {
        await userData.invalidateBrandRecommendations();
      }
    } catch (err) {
      console.error('Failed to ignore:', err);
    } finally {
      setIgnoring(null);
    }
  };

  // Map primary topics to UI category names
  const topicToCategoryMap: Record<string, string> = {
    'minecraft': 'Minecraft',
    'gaming': 'Gaming',
    'pc building': 'PC Gear',
    'pc gear': 'PC Gear',
    'server hosting': 'Server Hosting',
    'modding': 'Modding Tools',
    'modding tools': 'Modding Tools',
    'streaming': 'Creator Tools',
    'creator tools': 'Creator Tools',
    'gaming peripherals': 'Gaming Peripherals',
    'gaming chairs': 'Gaming Chairs',
    'headsets': 'Headsets',
    'tech': 'Tech',
    'hardware': 'Hardware',
  };

  // Get categories from creator profile topics OR from recommendations
  const topicCategories = creatorProfile?.primary_topics?.map((topic: string) => {
    const topicLower = topic.toLowerCase();
    for (const [key, cat] of Object.entries(topicToCategoryMap)) {
      if (topicLower.includes(key) || key.includes(topicLower)) {
        return cat;
      }
    }
    // If no mapping, capitalize first letter
    return topic.charAt(0).toUpperCase() + topic.slice(1).toLowerCase();
  }) || [];

  const recommendationCategories = Array.from(new Set(recommendations.map(r => r.category).filter(Boolean)));
  
  // Use topic-based categories if available, otherwise use recommendation categories
  const availableCategories: string[] = topicCategories.length > 0 
    ? topicCategories.filter((cat: string) => recommendationCategories.includes(cat) || cat)
    : recommendationCategories;

  const sizeTierLabels: Record<string, string> = {
    nano: 'Nano',
    micro: 'Micro',
    mid: 'Mid',
    large: 'Large',
  };

  const sizeTierSubs = creatorMetrics 
    ? (creatorMetrics.followers || Math.floor((creatorMetrics.avg_views_10 || 0) / 10)).toLocaleString()
    : '0';

  // Parse and filter recommendations when store data changes
  useEffect(() => {
    if (!recommendations.length) {
      setParsedRecommendations([]);
      return;
    }

    let parsed = recommendations.map((rec: any) => {
      const { dealType, attainabilityReason, cleanPitchAngle } = parsePitchMetadata(rec.suggested_pitch_angle || '');
      return {
        ...rec,
        deal_type: dealType || 'gifted',
        attainability_reason: attainabilityReason,
        suggested_pitch_angle: cleanPitchAngle,
      };
    });

    // Hard filter: Remove disallowed brands for nano/micro creators
    if (sizeTier === 'nano' || sizeTier === 'micro') {
      parsed = parsed.filter((rec: any) => {
        const brandName = rec.brand_name || '';
        return !isDisallowedBrand(brandName);
      });
    }

    setParsedRecommendations(parsed);
  }, [recommendations, sizeTier]);

  // Fetch brand contacts for all recommendations (must run unconditionally to avoid hook order changes)
  useEffect(() => {
    if (!recommendations || recommendations.length === 0) {
      return;
    }

    const fetchBrandContacts = async () => {
      const contactsMap: Record<string, any> = {};
      
      await Promise.all(
        recommendations.map(async (brand: any) => {
          try {
            const response = await fetch(`/api/enrich/get-contacts?brandName=${encodeURIComponent(brand.brand_name)}`);
            if (response.ok) {
              const data = await response.json();
              contactsMap[brand.id] = data;
            }
          } catch (error) {
            console.error(`[Discover] Error fetching contacts for ${brand.brand_name}:`, error);
          }
        })
      );

      setBrandContacts(contactsMap);
    };

    fetchBrandContacts();
  }, [recommendations]);

  // Poll for updates every 5 seconds if any brands are pending enrichment
  useEffect(() => {
    const hasPending = Object.values(brandContacts).some(c => c?.status === 'pending');
    if (!hasPending) {
      return;
    }

    const interval = setInterval(async () => {
      const contactsMap: Record<string, any> = {};
      
      await Promise.all(
        recommendations.map(async (brand: any) => {
          // Only refresh pending brands
          if (brandContacts[brand.id]?.status === 'pending') {
            try {
              const response = await fetch(`/api/enrich/get-contacts?brandName=${encodeURIComponent(brand.brand_name)}`);
              if (response.ok) {
                const data = await response.json();
                contactsMap[brand.id] = {
                  ...data,
                  website_url: data.website_url || null,
                  contact_page_url: data.contact_page_url || null,
                };
              }
            } catch (error) {
              console.error(`[Discover] Error refreshing contacts for ${brand.brand_name}:`, error);
            }
          } else {
            // Keep existing data for non-pending brands
            contactsMap[brand.id] = brandContacts[brand.id];
          }
        })
      );

      setBrandContacts(contactsMap);
    }, 5000);

    return () => clearInterval(interval);
  }, [brandContacts, recommendations, user?.id]);

  // Filter recommendations by category
  const filteredRecommendations = selectedCategory === 'All'
    ? parsedRecommendations.filter((r: any) => r.status !== 'ignored')
    : parsedRecommendations.filter((r: any) => r.category === selectedCategory && r.status !== 'ignored');

  // State A: Not connected / no scan data
  if (!hasMetrics) {
    return (
      <Screen center scroll={false} className="flex flex-col gap-4 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-indigo-100 rounded-full mx-auto flex items-center justify-center flex-shrink-0">
            <Search size={32} className="text-indigo-600" />
          </div>
          
          {/* Headline */}
          <h2 className="text-xl font-semibold text-gray-900 leading-tight">
            Connect your account to get brand matches
          </h2>
          
          {/* Body */}
          <p className="text-sm text-gray-600 leading-relaxed">
            We use your channel stats and top videos to generate brand recommendations.
          </p>
          
          {/* Primary CTA */}
          {user && (
            <div className="w-full pt-2">
              <ConnectAccountCTA
                connectedPlatforms={connectedPlatforms}
                onConnect={() => window.location.href = '/'}
                variant="primary"
                fullWidth
                size="lg"
                showSublabel={false}
              />
            </div>
          )}
      </Screen>
    );
  }

  // State B: Connected but no recommendations yet
  if (loading) {
    return (
      <Screen center scroll={false}>
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </Screen>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Screen center scroll={false} className="flex flex-col gap-4 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-indigo-100 rounded-full mx-auto flex items-center justify-center flex-shrink-0">
            <Sparkles size={32} className="text-indigo-600" />
          </div>
          
          {/* Headline */}
          <h2 className="text-xl font-semibold text-gray-900 leading-tight">
            No brand matches yet
          </h2>
          
          {/* Body */}
          <p className="text-sm text-gray-600 leading-relaxed">
            Generate AI-powered brand recommendations based on your channel data.
          </p>
          
          {/* Error from generation */}
          {regenerateError && (
            <div className="w-full p-3 rounded-lg bg-red-50 border border-red-200 text-left">
              <p className="text-sm text-red-800">{regenerateError}</p>
              <p className="text-xs text-red-600 mt-1">Try again or connect another platform for better matches.</p>
            </div>
          )}
          
          {/* Primary CTA */}
          <div className="w-full pt-2">
            <Button 
              variant="primary"
              onClick={() => {
                setRegenerateError(null);
                handleGenerate(false);
              }}
              disabled={generating}
              fullWidth
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Generating...
                </>
              ) : (
                'Generate brand matches'
              )}
            </Button>
          </div>
          
          {/* Loading overlay for empty state */}
          {generating && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-40 flex items-center justify-center">
              <div className="w-full max-w-sm px-4">
                <div className="text-center space-y-4 mb-6">
                  {/* Animated gradient bar */}
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                  
                  {/* Rotating status message */}
                  <p 
                    key={loadingMessageIndex}
                    className="text-sm font-medium text-gray-900 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    {loadingMessages[loadingMessageIndex]}
                  </p>
                </div>

                {/* Skeleton cards */}
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                      <div className="h-3 bg-gray-100 rounded w-full mb-1"></div>
                      <div className="h-3 bg-gray-100 rounded w-5/6"></div>
                      <div className="flex gap-2 mt-3">
                        <div className="h-8 bg-gray-100 rounded flex-1"></div>
                        <div className="h-8 bg-gray-100 rounded flex-1"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </Screen>
    );
  }

  // State C: Recommendations exist
  const togglePitchAngle = (id: string) => {
    const newExpanded = new Set(expandedPitchAngles);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedPitchAngles(newExpanded);
  };

  const toggleContacts = (id: string) => {
    const newExpanded = new Set(expandedContacts);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedContacts(newExpanded);
  };

  const handleCopyContact = (value: string, contactId: string) => {
    navigator.clipboard.writeText(value);
    setCopiedContactId(contactId);
    setTimeout(() => setCopiedContactId(null), 2000);
  };

  const handleOpenContact = (type: string, value: string) => {
    let url = '';
    if (type === 'email') {
      url = `mailto:${value}`;
    } else if (type === 'instagram') {
      const handle = value.replace('@', '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '');
      url = `https://www.instagram.com/${handle}`;
    } else if (type === 'tiktok') {
      const handle = value.replace('@', '').replace(/^https?:\/\/(www\.)?tiktok\.com\//, '');
      url = `https://www.tiktok.com/@${handle}`;
    } else if (type === 'linkedin' || type === 'website' || type === 'form') {
      url = value.startsWith('http') ? value : `https://${value}`;
    }
    
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Helper to get contact info array from brand_contacts data
  const getContactInfo = (brand: any) => {
    const contactData = brandContacts[brand.id];
    if (!contactData || contactData.status !== 'complete') {
      return [];
    }

    // Map contact types to icons
    const iconMap: Record<string, any> = {
      email: Mail,
      website: ExternalLink,
      instagram: Instagram,
      tiktok: Youtube, // Use Youtube icon as placeholder for TikTok
      linkedin: Linkedin,
      form: MessageSquare,
    };

    // Return contacts array if available
    if (contactData.contacts && contactData.contacts.length > 0) {
      return contactData.contacts.map((contact: any) => ({
        ...contact,
        icon: iconMap[contact.type] || ExternalLink,
      }));
    }

    return [];
  };

  // Handle manual enrichment trigger
  const handleFindContact = async (brandName: string, brandId: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('find_contact_clicked', { brandName, brandId });
    }
    setEnrichingBrands(prev => new Set(prev).add(brandId));
    
    // Enable debug mode in development
    const isDebug = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const debugParam = isDebug ? '?debug=1' : '';
    
    try {
      // Step 1: Trigger enrichment job
      const response = await fetch(`/api/enrich/trigger${debugParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, debug: isDebug }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to trigger enrichment');
      }

      const triggerData = await response.json();
      
      // If contact already exists, fetch and show immediately (no polling)
      if (triggerData.alreadyComplete) {
        try {
          const contactResponse = await fetch(`/api/enrich/get-contacts?brandName=${encodeURIComponent(brandName)}`);
          if (contactResponse.ok) {
            const data = await contactResponse.json();
            setBrandContacts(prev => ({
              ...prev,
              [brandId]: {
                ...data,
                website_url: data.website_url || null,
                contact_page_url: data.contact_page_url || null,
              },
            }));
          }
        } catch (e) {
          console.error('[Discover] Error fetching existing contact:', e);
        }
        setEnrichingBrands(prev => { const next = new Set(prev); next.delete(brandId); return next; });
        return;
      }
      
      // Log debug info in development
      if (isDebug && triggerData.debug) {
        console.log('[Enrichment Debug]', JSON.stringify(triggerData.debug, null, 2));
      }
      
      // Step 2: Immediately update UI to show pending status
      setBrandContacts(prev => ({
        ...prev,
        [brandId]: {
          contacts: [],
          status: 'pending',
        },
      }));

      // Step 3: Trigger the enrichment worker immediately (don't wait for cron)
      // Do this asynchronously - don't wait for it
      fetch(`/api/enrich/brand-contacts?limit=1${isDebug ? '&debug=1' : ''}`, {
        method: 'POST',
      })
        .then(async (workerResponse) => {
          if (isDebug && workerResponse.ok) {
            const workerData = await workerResponse.json();
            if (workerData.debug_details && workerData.debug_details.length > 0) {
              console.log('[Enrichment Debug Details]', JSON.stringify(workerData.debug_details[0], null, 2));
            }
          }
        })
        .catch((workerError) => {
          console.error('[Discover] Error triggering worker (non-fatal):', workerError);
          // Continue anyway - cron will pick it up or user can retry
        });

      // Step 4: Start polling for updates every 3 seconds
      let pollCount = 0;
      const maxPolls = 40; // 2 minutes max (40 * 3s)
      
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        try {
          const contactResponse = await fetch(`/api/enrich/get-contacts?brandName=${encodeURIComponent(brandName)}`);
          if (contactResponse.ok) {
            const data = await contactResponse.json();
            
            setBrandContacts(prev => ({
              ...prev,
              [brandId]: {
                ...data,
                website_url: data.website_url || null,
                contact_page_url: data.contact_page_url || null,
              },
            }));

            // Stop polling if complete or failed (or max polls reached)
            if (data.status === 'complete' || data.status === 'failed' || pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setEnrichingBrands(prev => {
                const next = new Set(prev);
                next.delete(brandId);
                return next;
              });
            }
          } else {
            // Backend error (e.g. 500 from get-contacts) - stop spinning and show failed
            const errBody = await contactResponse.json().catch(() => ({}));
            clearInterval(pollInterval);
            setBrandContacts(prev => ({
              ...prev,
              [brandId]: {
                contacts: [],
                status: 'failed',
                error: (errBody as { error?: string }).error || `Request failed (${contactResponse.status})`,
              },
            }));
            setEnrichingBrands(prev => { const next = new Set(prev); next.delete(brandId); return next; });
          }
        } catch (error) {
          console.error('[Discover] Error polling contacts:', error);
          clearInterval(pollInterval);
          setBrandContacts(prev => ({
            ...prev,
            [brandId]: {
              contacts: [],
              status: 'failed',
              error: error instanceof Error ? error.message : 'Failed to fetch contact status',
            },
          }));
          setEnrichingBrands(prev => { const next = new Set(prev); next.delete(brandId); return next; });
        }

        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setEnrichingBrands(prev => {
            const next = new Set(prev);
            next.delete(brandId);
            return next;
          });
        }
      }, 3000); // Poll every 3 seconds

      // Cleanup on unmount
      return () => {
        clearInterval(pollInterval);
        setEnrichingBrands(prev => {
          const next = new Set(prev);
          next.delete(brandId);
          return next;
        });
      };
    } catch (error: any) {
      console.error('[Discover] Error triggering enrichment:', error);
      
      // Update UI to show error
      setBrandContacts(prev => ({
        ...prev,
        [brandId]: {
          contacts: [],
          status: 'failed',
          error: error.message || 'Failed to start enrichment',
        },
      }));
      
      setEnrichingBrands(prev => {
        const next = new Set(prev);
        next.delete(brandId);
        return next;
      });
    }
  };

  // Validate email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Validate URL format
  const isValidUrl = (url: string) => {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        new URL(url);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const [activeFilter, setActiveFilter] = useState('all');
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'best', label: 'Best match' },
    { id: 'new', label: 'New' },
  ];

  // Map filtered recommendations to Figma format
  const trendingBrands = filteredRecommendations
    .sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 10)
    .map((brand: any) => ({
      id: brand.id,
      name: brand.brand_name,
      category: brand.category || brand.industry || 'General',
      match: `${Math.round((brand.confidence || 0) * 100)}%`,
      dealType: brand.deal_type === 'paid' ? 'Paid' : brand.deal_type === 'affiliate' ? 'Affiliate' : 'Gifted',
      brand: brand, // Keep full brand object for onClick
    }));

  return (
    <div className="min-h-screen bg-white pb-28">
      <div className="px-6 pt-16 pb-4">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-[28px] font-semibold text-[#0F172A] mb-1">
              Discover
            </h1>
            <p className="text-[15px] text-[#64748B]">
              Brands looking for creators like you
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                activeFilter === filter.id
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-[#F8FAFC] text-[#64748B]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
          
          {/* Compact tier pill */}
          {creatorMetrics && (
            <div className="mb-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full max-w-full">
                <span className="text-xs font-medium text-indigo-700 truncate">
                  {sizeTierLabels[sizeTier]} · {sizeTierSubs} {creatorMetrics.followers ? 'subs' : 'est'} · optimized
                </span>
                <button
                  type="button"
                  onClick={() => setShowWhyMatches(!showWhyMatches)}
                  className="text-indigo-600 hover:text-indigo-700 shrink-0"
                  title="Why these matches?"
                >
                  <Sparkles size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Why matches accordion */}
          {showWhyMatches && (
            <div className="mb-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg animate-in slide-in-from-top-2 duration-200">
              <p className="text-xs text-indigo-700 break-words">
                <span className="font-medium">Your creator tier: {sizeTierLabels[sizeTier]} ({sizeTierSubs} {creatorMetrics?.followers ? 'subscribers' : 'estimated from views'}).</span>
                {' '}These matches are optimized for your size.
                {sizeTier === 'nano' && (
                  <span className="block mt-1 text-indigo-600">Optimized for creators under 1k subs.</span>
                )}
              </p>
            </div>
          )}

      {/* Loading State */}
      {generating && (
        <div className="px-6 py-8 text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={32} />
          <p className="text-sm text-gray-600">{loadingMessages[loadingMessageIndex]}</p>
        </div>
      )}

      {/* Content */}
      {!generating && (
        <div className="px-6 space-y-8">
          <div>
            <SectionLabel className="mb-4">Trending Opportunities</SectionLabel>
            {trendingBrands.length > 0 ? (
              <div className="bg-white border border-[rgba(15,23,42,0.06)] rounded-[14px] divide-y divide-[rgba(15,23,42,0.06)]">
                {trendingBrands.map((item) => {
                  const brand = item.brand;
          const isPitchAngleExpanded = expandedPitchAngles.has(brand.id);
          const brandSize = estimateBrandSize(brand);
          const likelihood = calculateResponseLikelihood(brand, sizeTier, brand.deal_type);
          
          return (
            <div key={brand.id} className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
              {/* Top row: Brand name + Visit */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-base font-semibold text-gray-900 min-w-0 truncate">{brand.brand_name}</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const website = brand.website;
                    if (website && (website.startsWith('http://') || website.startsWith('https://'))) {
                      window.open(website, '_blank', 'noopener,noreferrer');
                    } else {
                      const searchQuery = encodeURIComponent(`${brand.brand_name} official website`);
                      window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  Visit
                  <ArrowRight size={12} />
                </button>
              </div>

              {/* Second row: Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                {brand.deal_type && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    brand.deal_type === 'paid' 
                      ? 'bg-green-100 text-green-700'
                      : brand.deal_type === 'affiliate'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {brand.deal_type === 'paid' ? 'Paid' : brand.deal_type === 'affiliate' ? 'Affiliate' : 'Gifted'}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  brandSize.size === 'Micro' 
                    ? 'bg-blue-100 text-blue-700'
                    : brandSize.size === 'Small'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {brandSize.size}{brandSize.estimated ? ' (est.)' : ''}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  likelihood === 'High'
                    ? 'bg-green-100 text-green-700'
                    : likelihood === 'Medium'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {likelihood} response
                </span>
              </div>

              {/* Body: Why match + Why attainable */}
              <div className="space-y-2 mb-3">
                {brand.why_match && (
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-gray-900">Why match: </span>
                    <span className="text-xs text-gray-700 line-clamp-2 break-words">{brand.why_match}</span>
                  </div>
                )}
                {brand.attainability_reason && (
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-gray-900">Why attainable: </span>
                    <span className="text-xs text-gray-700 line-clamp-2 break-words">{brand.attainability_reason}</span>
                  </div>
                )}
              </div>

              {/* Pitch angle - expandable */}
              {brand.suggested_pitch_angle && (
                <div className="mb-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => togglePitchAngle(brand.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    <ChevronDown size={12} className={`transition-transform shrink-0 ${isPitchAngleExpanded ? 'rotate-180' : ''}`} />
                    Pitch angle
                  </button>
                  {isPitchAngleExpanded && (
                    <p className="text-xs text-gray-600 italic mt-1.5 pl-4 border-l-2 border-indigo-100 break-words">
                      {brand.suggested_pitch_angle}
                    </p>
                  )}
                </div>
              )}

              {/* Contact section - expandable */}
              {(() => {
                const contactData = brandContacts[brand.id];
                const contacts = getContactInfo(brand);
                const isContactsExpanded = expandedContacts.has(brand.id);
                const primaryContact = contacts.find(c => c.type === brand.preferred_contact) || contacts[0];
                const hasContacts = contacts.length > 0;
                const enrichmentStatus = contactData?.status || 'none';
                const isEnriching = enrichingBrands.has(brand.id);
                const websiteUrl = contactData?.website_url || brand.website;
                const contactPageUrl = contactData?.contact_page_url || null;
                const hasWebsiteOrContactPage = !!(websiteUrl || contactPageUrl);
                
                // Show enrichment status if no contacts yet
                if (!hasContacts) {
                  if (enrichmentStatus === 'pending' || isEnriching) {
                    return (
                      <div className="mb-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin text-indigo-600" />
                          <p className="text-xs text-gray-600">
                            {isEnriching ? 'Searching web…' : 'Finding contact info…'}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  
                  // Show partial success if website or contact page found
                  if (hasWebsiteOrContactPage && enrichmentStatus === 'complete') {
                    const onlyWebsite = websiteUrl && !contactPageUrl;
                    const hasContactPage = !!contactPageUrl;
                    
                    return (
                      <div className="mb-3 pt-2 border-t border-gray-100">
                        <div className="space-y-2">
                          {websiteUrl && (
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col min-w-0 flex-1">
                                <p className="text-xs text-gray-600">Website found</p>
                                {onlyWebsite && (
                                  <p className="text-xs text-gray-500 mt-0.5">Couldn't find email or contact page</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => window.open(websiteUrl, '_blank', 'noopener,noreferrer')}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 shrink-0"
                              >
                                Visit
                                <ExternalLink size={12} />
                              </button>
                            </div>
                          )}
                          {contactPageUrl && (
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col min-w-0 flex-1">
                                <p className="text-xs text-gray-600">Contact page found</p>
                                {!websiteUrl && (
                                  <p className="text-xs text-gray-500 mt-0.5">Couldn't find email</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyContact(contactPageUrl, `${brand.id}-contact-page`)}
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  title="Copy URL"
                                >
                                  {copiedContactId === `${brand.id}-contact-page` ? (
                                    <CheckCircle2 size={12} className="text-green-600" />
                                  ) : (
                                    <Copy size={12} className="text-gray-600" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => window.open(contactPageUrl, '_blank', 'noopener,noreferrer')}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                                >
                                  Open
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleFindContact(brand.brand_name, brand.id)}
                            disabled={isEnriching}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                          >
                            {isEnriching ? 'Finding contact…' : 'Try finding email'}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  
                  // Only show "couldn't find" if failed after attempts
                  if (enrichmentStatus === 'failed') {
                    // Check attempts from job status (we'll show retry anyway)
                    return (
                      <div className="mb-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500">Couldn't find contact info yet</p>
                          <button
                            type="button"
                            onClick={() => {
                              handleFindContact(brand.brand_name, brand.id);
                              // In dev mode, log debug info to console
                              if (process.env.NODE_ENV === 'development') {
                                console.log('[Enrichment Debug] Retrying for:', brand.brand_name);
                              }
                            }}
                            disabled={isEnriching}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                          >
                            {isEnriching ? 'Finding…' : 'Try again'}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="mb-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500">No contact info yet</p>
                        <button
                          type="button"
                          onClick={() => handleFindContact(brand.brand_name, brand.id)}
                          disabled={isEnriching}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                        >
                          {isEnriching ? 'Finding…' : 'Find contact'}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="mb-3 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleContacts(brand.id)}
                      className="w-full flex items-center justify-between text-xs text-indigo-600 hover:text-indigo-700 font-medium mb-2"
                    >
                      <div className="flex items-center gap-2">
                        <span>Contact</span>
                        {primaryContact && !isContactsExpanded && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                            {primaryContact.label}
                          </span>
                        )}
                      </div>
                      <ChevronDown size={12} className={`transition-transform shrink-0 ${isContactsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isContactsExpanded && (
                      <div className="space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                        {contacts.map((contact, idx) => {
                          const contactId = `${brand.id}-${contact.type}-${idx}`;
                          const isCopied = copiedContactId === contactId;
                          const isValid = contact.type === 'email' ? isValidEmail(contact.value) : (contact.type === 'website' || contact.type === 'linkedin' || contact.type === 'form') ? isValidUrl(contact.value) : true;
                          
                          if (!isValid) return null; // Don't show invalid contact info
                          
                          return (
                            <div key={contactId} className="flex items-center gap-3 min-w-0 p-2 bg-gray-50 rounded-lg">
                              <contact.icon size={14} className="text-gray-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900">{contact.label}</p>
                                <p className="text-xs text-gray-600 truncate">{contact.value}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyContact(contact.value, contactId)}
                                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                  title="Copy"
                                >
                                  {isCopied ? (
                                    <CheckCircle2 size={14} className="text-green-600" />
                                  ) : (
                                    <Copy size={14} className="text-gray-600" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenContact(contact.type, contact.value)}
                                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                                  title="Open"
                                >
                                  <ExternalLink size={14} className="text-gray-600" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Action row - always visible */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                {brand.status !== 'saved' && (
                  <button
                    type="button"
                    onClick={() => handleSave(brand.id)}
                    disabled={!!saving}
                    className="px-3 py-2.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px] flex items-center justify-center shrink-0"
                  >
                    {saving === brand.id ? <Loader2 className="animate-spin" size={14} /> : 'Save'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleIgnore(brand.id)}
                  disabled={!!ignoring}
                  className="px-3 py-2.5 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px] flex items-center justify-center shrink-0"
                >
                  {ignoring === brand.id ? <Loader2 className="animate-spin" size={14} /> : 'Ignore'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPitchModal(brand)}
                  className="flex-1 px-3 py-2.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all min-h-[44px] flex items-center justify-center shadow-sm shrink-0"
                >
                  Generate pitch
                </button>
              </div>
            </div>
          );
        })}
              </div>
            ) : null}
          </div>
        </div>
      )}

        {showPitchModal && (
          <PitchFlowModal 
            brand={showPitchModal} 
            onClose={() => setShowPitchModal(null)}
            onComplete={() => {
              setShowPitchModal(null);
            }}
          />
        )}

        {/* Regenerate Modal - Bottom Sheet */}
        {showRegenerateModal && (
        <PhoneModal onClickBackdrop={() => {
          if (!generating) {
            setShowRegenerateModal(false);
            setRegenerateError(null);
            setJobId(null);
            setJobStep(null);
          }
        }}>
          <div 
            className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center pointer-events-auto" 
            onClick={(e: React.MouseEvent) => {
              // Only close if clicking directly on overlay, not sheet
              if (e.target === e.currentTarget && !generating) {
                setShowRegenerateModal(false);
                setRegenerateError(null);
              }
            }}
          >
            <div 
              className="w-full max-w-full bg-white rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto shadow-2xl pointer-events-auto relative z-10 flex flex-col" 
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {generating ? "Finding new matches" : "Generate new matches"}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {generating ? "This usually takes 10–20 seconds." : "We'll find new brands more likely to work with creators your size."}
                  </p>
                </div>
                {generating ? (
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowRegenerateModal(false);
                      setRegenerateError(null);
                      setJobId(null);
                      setJobStep(null);
                      setGenerating(false);
                    }} 
                    className="text-sm text-gray-500 hover:text-gray-700 flex-shrink-0 ml-4"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowRegenerateModal(false);
                      setRegenerateError(null);
                      setJobId(null);
                      setJobStep(null);
                    }} 
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-4"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Advanced Options - Collapsible (Collapsed by default) */}
              {!generating && (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="w-full flex items-center justify-between py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <span>Advanced options</span>
                    <ChevronDown 
                      size={16} 
                      className={`transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
                    />
                  </button>
                  
                  {showAdvancedOptions && (
                    <div className="mt-3 space-y-2 pl-1">
                      <button
                        type="button"
                        onClick={() => handleRegenModeChange('replace')}
                        className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          regenMode === 'replace'
                            ? 'bg-indigo-50/50 border-indigo-300'
                            : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                          regenMode === 'replace'
                            ? 'border-indigo-500 bg-indigo-500'
                            : 'border-gray-400'
                        }`}>
                          {regenMode === 'replace' && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-medium text-gray-700">Replace unsaved matches</p>
                          <p className="text-xs text-gray-500 mt-0.5">Your saved matches will be preserved.</p>
                        </div>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => handleRegenModeChange('keep')}
                        className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border transition-all ${
                          regenMode === 'keep'
                            ? 'bg-green-50/50 border-green-300'
                            : 'bg-gray-50/50 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                          regenMode === 'keep'
                            ? 'border-green-500 bg-green-500'
                            : 'border-gray-400'
                        }`}>
                          {regenMode === 'keep' && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-xs font-medium text-gray-700">Keep saved matches</p>
                          <p className="text-xs text-gray-500 mt-0.5">Only unsaved matches will be replaced.</p>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 pt-1 pl-1">
                        <input
                          type="checkbox"
                          id="remember-choice"
                          checked={rememberChoice}
                          onChange={(e) => handleRememberChoiceChange(e.target.checked)}
                          className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <label htmlFor="remember-choice" className="text-xs text-gray-600 cursor-pointer">
                          Remember my choice
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loading State - Minimal Design */}
              {generating && (
                <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-6">
                  {/* Single Gradient Ring Animation */}
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div 
                      className="absolute inset-0 rounded-full animate-gradient-ring"
                      style={{
                        background: 'conic-gradient(from 0deg, #6366f1, #a855f7, #ec4899, #6366f1)',
                        WebkitMask: 'radial-gradient(circle, transparent 22px, black 24px)',
                        mask: 'radial-gradient(circle, transparent 22px, black 24px)',
                      }}
                    ></div>
                    <div className="absolute inset-2 rounded-full bg-white"></div>
                  </div>

                  {/* Status Line (Dynamic) */}
                  <div className="text-center">
                    <p className="text-sm text-gray-700 font-medium" style={{
                      animation: 'fadeIn 0.5s ease-out'
                    }}>
                      {jobLog.length > 0 
                        ? jobLog[jobLog.length - 1]
                        : statusMessages[currentStatusIndex]}
                    </p>
                  </div>

                  {/* Optional Tip (Small and Subtle) */}
                  <div className="text-center max-w-xs">
                    <p className="text-xs text-gray-500" style={{
                      animation: 'fadeIn 0.6s ease-out'
                    }}>
                      {influencerTips[currentTipIndex]}
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {regenerateError && !generating && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <p className="text-sm text-red-700">{regenerateError}</p>
                </div>
              )}

              {/* CTA Button - Only show when not loading */}
              {!generating && (
                <div className="pt-6 mt-auto">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRegenerateModal(false);
                        setRegenerateError(null);
                        setJobId(null);
                        setJobStep(null);
                      }}
                      className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[48px]"
                    >
                      Cancel
                    </button>
                    
                    <Button
                      onClick={() => handleGenerate(true)}
                      className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold min-h-[48px]"
                    >
                      Find new matches
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </PhoneModal>
        )}
    </div>
  );
};

// Creator Deals - Real pitches pipeline
const CreatorDeals = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
  const { user } = useAuth();
  const userData = useUserData();
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'brand' | 'status'>('recent');

  // Use data from store
  const pitches = userData.pitches || [];
  const followups = userData.followups || [];
  const loading = userData.loading && !pitches.length && !userData.pitches;

  const handleUpdateStatus = async (pitchId: string, status: string) => {
    if (!user) return;
    
    setUpdatingStatus(pitchId);
    try {
      const response = await fetch('/api/pitches/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          pitchId,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // Refresh pitches from store
      await userData.invalidatePitches();
    } catch (err) {
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleCopyPitch = (pitch: any) => {
    const textToCopy = pitch.channel === 'email'
      ? `Subject: ${pitch.subject || ''}\n\n${pitch.body}`
      : pitch.body;
    
    navigator.clipboard.writeText(textToCopy);
    setCopiedPitchId(pitch.id);
    setTimeout(() => setCopiedPitchId(null), 2000);
  };

  const handleMarkFollowupDone = async (followupId: string) => {
    if (!user) return;
    
    try {
      const response = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          followupId,
          status: 'done',
        }),
      });

      if (response.ok) {
        await userData.invalidatePitches();
      }
    } catch (err) {
      console.error('Failed to mark followup done:', err);
    }
  };

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    draft: { label: 'Draft', color: 'text-gray-700', bgColor: 'bg-gray-50' },
    sent: { label: 'Sent', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    replied: { label: 'Replied', color: 'text-green-700', bgColor: 'bg-green-50' },
    closed: { label: 'Closed', color: 'text-gray-600', bgColor: 'bg-gray-50' },
    ignored: { label: 'Ignored', color: 'text-gray-500', bgColor: 'bg-gray-50' },
  };

  // Calculate status counts
  const statusCounts = pitches.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeCount = (statusCounts.sent || 0) + (statusCounts.replied || 0);

  // Filter pitches based on selected status
  const filteredPitches = (() => {
    let filtered: any[] = [];
    if (selectedStatus === 'active') {
      filtered = pitches.filter(p => p.status === 'sent' || p.status === 'replied');
    } else if (selectedStatus === 'all') {
      filtered = pitches;
    } else {
      filtered = pitches.filter(p => p.status === selectedStatus);
    }
    
    // Sort pitches
    return [...filtered].sort((a, b) => {
      if (sortBy === 'recent') {
        const aTime = new Date(a.updated_at || a.created_at).getTime();
        const bTime = new Date(b.updated_at || b.created_at).getTime();
        return bTime - aTime;
      } else if (sortBy === 'brand') {
        return (a.brand_name || '').localeCompare(b.brand_name || '');
      } else if (sortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '');
      }
      return 0;
    });
  })();

  // Calculate reply rate
  const replyRate = activeCount > 0 
    ? Math.round(((statusCounts.replied || 0) / activeCount) * 100)
    : 0;

  // Get pitches waiting for replies (sent > 3 days ago)
  const waitingForReplies = pitches.filter(p => {
    if (p.status !== 'sent') return false;
    const daysSinceSent = (Date.now() - new Date(p.updated_at || p.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceSent > 3;
  });

  // Helper to check if pitch needs follow-up
  const needsFollowUp = (pitch: any) => {
    if (pitch.status !== 'sent') return false;
    const daysSinceSent = (Date.now() - new Date(pitch.updated_at || pitch.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceSent > 3;
  };

  if (loading) {
    return (
      <Screen center scroll={false}>
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </Screen>
    );
  }

  return (
    <Screen scroll={true}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-gray-200">
        <Container className="pt-4 pb-3">
          {/* Title and subtitle - centered */}
          <div className="mb-3 text-center">
            <h1 className="text-lg font-semibold text-gray-900">Pitches</h1>
            <p className="text-sm text-gray-600 mt-1">Your brand outreach pipeline</p>
          </div>

          {/* Compact pipeline summary - centered */}
          <div className="mb-3 text-center">
            <p className="text-xs text-gray-600">
              {activeCount} active · {statusCounts.replied || 0} replied · {statusCounts.sent || 0} sent · Reply rate {replyRate}%
            </p>
          </div>

          {/* Primary CTA - centered */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => onNavigate('discover')}
              className="flex-1 px-4 py-2.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm min-h-[44px]"
            >
              Pitch a brand
            </button>
            <button
              type="button"
              onClick={() => onNavigate('discover')}
              className="px-4 py-2.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] shrink-0 whitespace-nowrap"
            >
              Find matches
            </button>
          </div>

          {/* Filter tabs - segmented control - centered */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg bg-gray-100 p-1 gap-1">
            <button
              type="button"
              onClick={() => setSelectedStatus('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all shrink-0 whitespace-nowrap ${
                selectedStatus === 'active'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('draft')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all shrink-0 whitespace-nowrap ${
                selectedStatus === 'draft'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Drafts
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('closed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all shrink-0 whitespace-nowrap ${
                selectedStatus === 'closed'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Closed
            </button>
            </div>
          </div>
        </Container>
      </div>

      {/* Scrollable content */}
      <Container className="py-4 space-y-3">
        {/* Sorting control */}
        {filteredPitches.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-600">{filteredPitches.length} {filteredPitches.length === 1 ? 'pitch' : 'pitches'}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'recent' | 'brand' | 'status')}
                className="text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="recent">Recent activity</option>
                <option value="brand">Brand name</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        )}

        {/* Reminder for waiting pitches */}
        {waitingForReplies.length > 0 && selectedStatus === 'active' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-900 break-words">
                  {waitingForReplies.length} {waitingForReplies.length === 1 ? 'pitch' : 'pitches'} waiting on reply
                </p>
                <p className="text-xs text-amber-700 mt-0.5 break-words">Follow up to increase response rate</p>
              </div>
            </div>
          </div>
        )}

        {/* Follow-ups section (compact) */}
        {followups.length > 0 && selectedStatus === 'active' && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h3 className="text-xs font-semibold text-indigo-900 min-w-0 truncate">Follow-ups due</h3>
              <span className="text-xs text-indigo-700 shrink-0 whitespace-nowrap">{followups.length}</span>
            </div>
            <div className="space-y-1.5">
              {followups.slice(0, 2).map((followup: any) => (
                <div key={followup.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{followup.pitches?.brand_name || 'Brand'}</p>
                    <p className="text-xs text-gray-600 truncate">
                      {new Date(followup.due_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMarkFollowupDone(followup.id)}
                    className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0 whitespace-nowrap"
                  >
                    Done
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for no pitches */}
        {filteredPitches.length === 0 ? (
          <div className="p-5 border border-gray-200 rounded-2xl bg-white text-center">
            <div className="w-12 h-12 bg-indigo-100 rounded-full mx-auto mb-3 flex items-center justify-center">
              <FileText size={20} className="text-indigo-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {selectedStatus === 'active' 
                ? 'No active pitches'
                : selectedStatus === 'draft'
                ? 'No drafts yet'
                : selectedStatus === 'closed'
                ? 'No closed pitches'
                : `No ${selectedStatus} pitches`}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {selectedStatus === 'active'
                ? "Let's send your next one."
                : selectedStatus === 'draft'
                ? 'Start by generating a pitch.'
                : selectedStatus === 'closed'
                ? 'View your active pitches or start a new one.'
                : 'Get started by finding brand matches.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('discover')}
              className="w-full px-4 py-2.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm min-h-[44px]"
            >
              {selectedStatus === 'active' 
                ? 'Find matches'
                : selectedStatus === 'draft'
                ? 'Generate a pitch'
                : 'View matches'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPitches.map((pitch) => {
              const canFollowUp = needsFollowUp(pitch);
              
              return (
                <div key={pitch.id} className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                  {/* Top row: Brand name + Status */}
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-base font-semibold text-gray-900 min-w-0 truncate">{pitch.brand_name}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 whitespace-nowrap ${statusConfig[pitch.status]?.bgColor || 'bg-gray-50'} ${statusConfig[pitch.status]?.color || 'text-gray-700'}`}>
                      {statusConfig[pitch.status]?.label || pitch.status}
                    </span>
                  </div>

                  {/* Meta row - deliverable, compensation, updated */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3 min-w-0">
                    {pitch.channel && (
                      <span className="shrink-0">{pitch.channel === 'email' ? 'Email' : 'DM'}</span>
                    )}
                    {pitch.deliverable && (
                      <>
                        <span className="shrink-0">·</span>
                        <span className="truncate">{pitch.deliverable}</span>
                      </>
                    )}
                    {pitch.suggested_rate && (
                      <>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">${pitch.suggested_rate.toLocaleString()}</span>
                      </>
                    )}
                    <span className="shrink-0 ml-auto">
                      Updated {new Date(pitch.updated_at || pitch.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  {/* Action row */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    {/* Primary: Open/Copy pitch */}
                    <button
                      type="button"
                      onClick={() => handleCopyPitch(pitch)}
                      className="flex-1 px-3 py-2.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-all min-h-[44px] flex items-center justify-center gap-1.5 min-w-0 shadow-sm"
                    >
                      {copiedPitchId === pitch.id ? (
                        <>
                          <Check size={14} className="shrink-0" />
                          <span className="truncate">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} className="shrink-0" />
                          <span className="truncate">Copy pitch</span>
                        </>
                      )}
                    </button>

                    {/* Secondary: Conditional actions */}
                    {pitch.status === 'sent' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(pitch.id, 'replied')}
                          disabled={updatingStatus === pitch.id}
                          className="px-3 py-2.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors min-h-[44px] disabled:opacity-50 shrink-0 whitespace-nowrap"
                        >
                          {updatingStatus === pitch.id ? <Loader2 className="animate-spin" size={14} /> : 'Mark replied'}
                        </button>
                        {canFollowUp && (
                          <button
                            type="button"
                            onClick={() => onNavigate('ai')}
                            className="px-3 py-2.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors min-h-[44px] shrink-0 whitespace-nowrap"
                          >
                            Follow up
                          </button>
                        )}
                      </>
                    )}
                    {pitch.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(pitch.id, 'closed')}
                        disabled={updatingStatus === pitch.id}
                        className="px-3 py-2.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px] disabled:opacity-50 shrink-0 whitespace-nowrap"
                      >
                        {updatingStatus === pitch.id ? <Loader2 className="animate-spin" size={14} /> : 'Close'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </Screen>
  );
};

// AI Chat Assistant - Premium Exla Feature
const CreatorAI = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(true);
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [showContextDrawer, setShowContextDrawer] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exla_ai_messages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        } catch (e) {
          console.warn('Failed to load saved messages:', e);
        }
      }
    }
  }, []);

  // Save messages to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem('exla_ai_messages', JSON.stringify(messages));
    }
  }, [messages]);

  // Load context on mount
  useEffect(() => {
    if (user) {
      loadContext();
    }
  }, [user]);

  const loadContext = async () => {
    if (!user) return;
    setLoadingContext(true);
    try {
      const response = await fetch(`/api/assistant/context?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setContextData(data.context);
      }
    } catch (err) {
      console.error('Failed to load context:', err);
    } finally {
      setLoadingContext(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (customMessage?: string) => {
    const messageToSend = customMessage || input.trim();
    if (!messageToSend || loading) return;

    const userMessage = messageToSend;
    if (!customMessage) {
      setInput("");
    }
    setError(null);
    
    // Add user message to state
    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          context: useContext && contextData ? contextData : undefined,
          mode: useContext && contextData ? "exla" : "generic",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      // Add assistant response
      setMessages([...newMessages, { role: "assistant", content: data.text }]);
    } catch (err: any) {
      console.error("Chat error:", err);
      setError(err.message || "Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearChat = () => {
    setShowClearConfirm(true);
  };

  const confirmClearChat = () => {
    setMessages([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('exla_ai_messages');
    }
    setShowClearConfirm(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { label: "Find brands to pitch", prompt: "Which brand should I pitch today?" },
    { label: "Rewrite my pitch", prompt: "Rewrite my pitch (less salesy)" },
    { label: "Follow-up", prompt: "Generate follow-up" },
    { label: "Media kit bullets", prompt: "Turn my stats into a media kit bullet list" },
    { label: "Content ideas", prompt: "What content should I post to attract brands?" },
    { label: "Fix my profile", prompt: "Rate my profile and tell me what to fix" },
  ];

  const hasData = contextData && (
    contextData.creator_metrics ||
    contextData.creator_profile ||
    (contextData.brand_recommendations && contextData.brand_recommendations.length > 0)
  );

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Top Header - Sticky with backdrop blur */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200">
        <Container className="pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900">Exla Assistant</h1>
            <div className="flex items-center gap-2">
              {/* Clear Chat Button */}
              <button
                type="button"
                onClick={handleClearChat}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
              >
                <Trash2 size={12} className="flex-shrink-0" />
                <span className="whitespace-nowrap">Clear</span>
              </button>
              
              {/* Use My Data Toggle */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-600 whitespace-nowrap">Use my data</span>
                <button
                  type="button"
                  onClick={() => setUseContext(!useContext)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                    useContext ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle use my data"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      useContext ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* Messages area - scrollable (ONLY vertical scroll region) */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain no-scrollbar min-h-0"
        style={{ scrollBehavior: 'smooth' }}
      >
        <Container className="py-4 space-y-4">
          {/* Quick Actions - Horizontal Scroll Row */}
          <div className="relative">
            <p className="text-xs font-medium text-gray-600 mb-2">Quick actions</p>
            <div 
              className="flex w-full gap-2 overflow-x-auto pb-2 no-scrollbar -mx-5 pl-5 pr-5 relative"
              style={{ 
                WebkitOverflowScrolling: 'touch',
                scrollPaddingRight: '1.25rem',
                scrollPaddingLeft: '1.25rem'
              }}
            >
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap flex-shrink-0"
                >
                  {action.label}
                </button>
              ))}
              {/* Subtle right fade gradient */}
              <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Context Preview - Collapsible Card */}
          <div>
            <button
              type="button"
              onClick={() => setShowContextDrawer(!showContextDrawer)}
              className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-medium text-gray-700">Context preview</span>
              <ChevronDown 
                size={16} 
                className={`text-gray-500 transition-transform shrink-0 ${showContextDrawer ? 'rotate-180' : ''}`}
              />
            </button>
            
            {showContextDrawer && (
              <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg space-y-3 animate-in slide-in-from-top-2 duration-200">
                {loadingContext ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="animate-spin text-indigo-600" size={20} />
                  </div>
                ) : hasData ? (
                  <>
                    {contextData.creator_metrics && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-gray-900">Creator Stats</p>
                        <p className="text-gray-600 break-words">
                          {contextData.creator_metrics.followers?.toLocaleString() || 0} subscribers • 
                          {contextData.creator_metrics.avg_views_10?.toLocaleString() || 0} avg views • 
                          {contextData.creator_metrics.engagement_rate_10?.toFixed(2) || 0}% engagement
                        </p>
                      </div>
                    )}
                    {contextData.creator_profile && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-gray-900">Tier & Topics</p>
                        <p className="text-gray-600 break-words">
                          {contextData.creator_profile.size_tier || 'unknown'} • 
                          {contextData.creator_profile.primary_topics?.join(', ') || 'general'}
                        </p>
                      </div>
                    )}
                    {contextData.top_videos && contextData.top_videos.length > 0 && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-gray-900">Top Videos</p>
                        <ul className="text-gray-600 space-y-0.5">
                          {contextData.top_videos.slice(0, 3).map((v: any, i: number) => (
                            <li key={i} className="break-words">• {v.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {contextData.brand_recommendations && contextData.brand_recommendations.length > 0 && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-gray-900">Available Matches</p>
                        <p className="text-gray-600">{contextData.brand_recommendations.length} brands</p>
                      </div>
                    )}
                    {contextData.pitches_summary && (
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-gray-900">Pitch Pipeline</p>
                        <p className="text-gray-600">
                          {contextData.pitches_summary.counts.draft || 0} drafts • 
                          {contextData.pitches_summary.counts.sent || 0} sent • 
                          {contextData.pitches_summary.counts.replied || 0} replied
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={loadContext}
                      disabled={loadingContext}
                      className="w-full text-xs py-1.5 text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {loadingContext ? <Loader2 className="animate-spin mx-auto" size={14} /> : 'Refresh data'}
                    </button>
                  </>
                ) : (
                  <div className="text-center py-4 space-y-3">
                    <p className="text-xs text-gray-600">No data available</p>
                    <ConnectAccountCTA
                      connectedPlatforms={[]}
                      onConnect={() => window.location.href = '/'}
                      variant="primary"
                      size="sm"
                      showSublabel={false}
                      className="text-xs py-1.5"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Sparkles size={40} className="text-indigo-400 opacity-60" />
              <p className="text-sm font-medium text-gray-900">Start a conversation</p>
              <p className="text-xs text-gray-500 text-center max-w-[240px]">Try a quick action above or ask a question</p>
            </div>
          )}
          
          {/* Messages */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in duration-300`}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                  <Sparkles size={14} className="text-indigo-600" />
                </div>
              )}
              <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} min-w-0 max-w-[85%]`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 break-words ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-900 border border-gray-200 shadow-sm"
                  }`}
                >
                  <div className="text-sm leading-relaxed break-words space-y-2">
                    {(msg.role === "assistant" ? sanitizeChatMessage(msg.content) : msg.content)
                      .split(/\n\n+/)
                      .filter(Boolean)
                      .map((para, i) => (
                        <p key={i} className="whitespace-pre-wrap">{para}</p>
                      ))}
                  </div>
                </div>
                {msg.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => handleCopy(sanitizeChatMessage(msg.content), idx)}
                    className="mt-1 text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <CheckCircle2 size={12} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        Copy
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start gap-2 animate-in fade-in duration-300">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                <Sparkles size={14} className="text-indigo-600" />
              </div>
              <div className="bg-white text-gray-900 border border-gray-200 rounded-2xl px-4 py-2.5 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </Container>
      </div>

      {/* Composer - pinned at bottom above tab bar */}
      <div 
        className="sticky bottom-0 z-10 bg-white/90 backdrop-blur-sm border-t border-gray-200"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Container className="pt-3 pb-3">
          {error && (
            <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 animate-in fade-in duration-200 break-words">
              {error}
            </div>
          )}
          <div className="flex gap-3 items-end w-full">
            <div className="flex-1 min-w-0">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask Exla..."
                rows={1}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none max-h-32 overflow-y-auto no-scrollbar"
                disabled={loading}
                style={{ 
                  minHeight: '42px',
                  lineHeight: '1.5'
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
        </Container>
      </div>

      {/* Clear Chat Confirmation Dialog */}
      {showClearConfirm && (
        <PhoneModal onClickBackdrop={() => setShowClearConfirm(false)}>
          <div 
            className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowClearConfirm(false);
              }
            }}
          >
            <div 
              className="bg-white rounded-xl p-5 max-w-[320px] w-full mx-4 shadow-xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-gray-900 mb-2">Clear chat history?</h3>
              <p className="text-sm text-gray-600 mb-4">This will permanently delete all messages in this conversation.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmClearChat}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors min-h-[40px]"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </PhoneModal>
      )}
    </div>
  );
};

// Settings Context for app-wide settings state
interface SettingsState {
  reduceMotion: boolean;
  haptics: boolean;
  useMyDataInAI: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

const SettingsContext = createContext<{
  settings: SettingsState;
  updateSetting: (key: keyof SettingsState, value: boolean) => void;
} | null>(null);

const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<SettingsState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exla_settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('Failed to parse settings:', e);
        }
      }
    }
    return {
      reduceMotion: false,
      haptics: true,
      useMyDataInAI: true,
      emailNotifications: true,
      pushNotifications: true,
    };
  });

  const updateSetting = useCallback((key: keyof SettingsState, value: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      if (typeof window !== 'undefined') {
        localStorage.setItem('exla_settings', JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
};

// Settings Screen Component
const SettingsScreen = ({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) => {
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Ensure light mode is always applied
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, []);

  const handleSignOutClick = () => {
    onSignOut();
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setDeletingAccount(true);
    try {
      // Get auth token
      const { supabase } = await import('../lib/supabaseClient');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      
      // Call API route to delete account
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }
      
      // Sign out the user
      await supabase.auth.signOut();
      
      // Close modal and redirect
      setShowDeleteConfirm(false);
      
      // Reload the page to clear all state and show landing screen
      window.location.href = '/';
    } catch (err: any) {
      console.error('Delete account error:', err);
      alert(`Failed to delete account: ${err.message || 'Please try again.'}`);
      setDeletingAccount(false);
    }
  };

  return (
    <Screen scroll={true}>
      <Container className="pt-4 pb-6 space-y-4">
        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        </div>

        {/* Appearance Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Appearance</h2>
          <Card>
            <div className="space-y-4">
              <ToggleRow
                label="Reduce motion"
                description="Reduce animations and transitions"
                checked={settings.reduceMotion}
                onChange={(checked) => updateSetting('reduceMotion', checked)}
              />
            </div>
          </Card>
        </div>

        {/* Notifications Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
          <Card>
            <div className="space-y-4">
              <ToggleRow
                label="Email notifications"
                description="Receive updates via email"
                checked={settings.emailNotifications}
                onChange={(checked) => updateSetting('emailNotifications', checked)}
              />
              <ToggleRow
                label="Push notifications"
                description="Receive push notifications"
                checked={settings.pushNotifications}
                onChange={(checked) => updateSetting('pushNotifications', checked)}
              />
            </div>
          </Card>
        </div>

        {/* Privacy Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Privacy</h2>
          <Card>
            <div className="space-y-4">
              <ToggleRow
                label="Haptics"
                description="Enable haptic feedback"
                checked={settings.haptics}
                onChange={(checked) => updateSetting('haptics', checked)}
              />
            </div>
          </Card>
        </div>

        {/* AI Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">AI Assistant</h2>
          <Card>
            <div className="space-y-4">
              <ToggleRow
                label="Use my data in AI"
                description="Share your profile and metrics with AI Assistant"
                checked={settings.useMyDataInAI}
                onChange={(checked) => updateSetting('useMyDataInAI', checked)}
              />
            </div>
          </Card>
        </div>

        {/* Account Section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Account</h2>
          <Card>
            <div className="space-y-0">
              <button
                type="button"
                onClick={handleSignOutClick}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-red-600">Sign out</span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <div className="border-t border-gray-200" />
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
              >
                <span className="text-sm font-medium text-red-600">Delete account</span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          </Card>
        </div>
      </Container>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <PhoneModal onClickBackdrop={() => setShowDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Delete account?</h3>
              <p className="text-sm text-gray-600">
                This action cannot be undone. All your data, including pitches, matches, and connected accounts will be permanently deleted.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  fullWidth
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingAccount ? (
                    <>
                      <Loader2 className="animate-spin mr-2 inline" size={16} />
                      Deleting...
                    </>
                  ) : (
                    'Delete account'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </PhoneModal>
      )}
    </Screen>
  );
};

// Toggle Row Component
const ToggleRow = ({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void }) => {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-indigo-600' : 'bg-gray-300'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

const CreatorProfile = ({ onSignOut, onShowPublicKit, onNavigateToSettings }: { onSignOut: () => void; onShowPublicKit: () => void; onNavigateToSettings: () => void }) => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [socialAccounts, setSocialAccounts] = useState<Array<{ platform: string; handle: string | null; created_at: string }>>([]);
  const [creatorMetrics, setCreatorMetrics] = useState<Array<{ platform: string; followers: number; avg_views_10: number; engagement_rate_10: number }>>([]);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<{ platform: string; handle: string | null } | null>(null);

  const fetchData = async () => {
    if (!user) return;
    
    const userProfile = await getProfile(user.id);
    const creatorProfile = await getCreatorProfile(user.id);
    setProfile(userProfile);
    setCreator(creatorProfile);
    
    // If niche is missing, trigger profile rebuild to generate it
    if (!creatorProfile?.niche) {
      console.log('[CreatorProfile] Niche missing, triggering profile rebuild...');
      try {
        const rebuildResponse = await fetch('/api/profile/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
        
        if (!rebuildResponse.ok) {
          const errorData = await rebuildResponse.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[CreatorProfile] Profile rebuild failed:', errorData);
        } else {
          const rebuildData = await rebuildResponse.json();
          console.log('[CreatorProfile] Profile rebuild response:', rebuildData);
          
          // Wait a moment for DB to update, then reload creator profile
          await new Promise(resolve => setTimeout(resolve, 500));
          const updatedCreator = await getCreatorProfile(user.id);
          if (updatedCreator) {
            setCreator(updatedCreator);
            console.log('[CreatorProfile] ✅ Profile rebuilt, niche:', updatedCreator.niche);
          } else {
            console.warn('[CreatorProfile] Profile rebuilt but creatorProfile is still null');
          }
        }
      } catch (err: any) {
        console.error('[CreatorProfile] Failed to rebuild profile:', err.message || err);
      }
    }

    // Fetch connected social accounts
    try {
      const { supabase } = await import('../lib/supabaseClient');
      const { data, error } = await supabase
        .from('social_accounts')
        .select('platform, handle, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSocialAccounts(data);
      }

      // Fetch creator metrics (all platforms for this user)
      const { data: metrics, error: metricsError } = await supabase
        .from('creator_metrics')
        .select('platform, followers, avg_views_10, engagement_rate_10, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!metricsError && metrics) {
        // Log which platform's data is being loaded
        // Note: RLS policies ensure only this user's data is returned
        const platforms = metrics.map((m: any) => m.platform).join(",");
        console.log(`[ExlaApp] Settings page - userId=${user.id}, loaded platforms=${platforms || "none"}, metrics count=${metrics.length}`);
        
        setCreatorMetrics(metrics);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLoading(false);
      return;
    }

    fetchData();
  }, [user, authLoading]);

  const handleDisconnect = async (platform: string) => {
    if (!user) return;
    
    setDisconnecting(platform);
    try {
      const response = await fetch('/api/social/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, userId: user.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      // Refresh data
      await fetchData();
      setShowConfirm(null);
    } catch (err) {
      console.error('Disconnect error:', err);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  };

  // Show loading only if no data at all
  if ((loading || authLoading) && !socialAccounts.length && !creatorMetrics.length && !profile) {
    return (
      <Screen center scroll={false}>
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen center scroll={false}>
        <MutedText>Please sign in to view your profile</MutedText>
      </Screen>
    );
  }

  const username = profile?.username || user?.email?.split('@')[0] || 'creator';

  return (
    <Screen scroll={true} className="flex flex-col gap-4 pt-4">

      <Card>
        <PageTitle className="mb-3">@{username}</PageTitle>
        
        {/* Display metrics from creator_metrics if available */}
        {creatorMetrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 mb-4">
            {creatorMetrics.map((metric) => (
              <div key={metric.platform} className="space-y-1">
                <p className="text-xs text-gray-600 capitalize">{metric.platform}</p>
                <p className="text-lg font-semibold text-gray-900">
                  {metric.followers !== null && metric.followers !== undefined 
                    ? metric.followers.toLocaleString() 
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-500">{metric.platform === 'tiktok' ? 'followers' : 'subscribers'}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-6 text-xs mb-4">
          <div>
              <p className="text-gray-600 mb-0.5">Audience Size</p>
              <p className="font-semibold text-gray-900">{creator?.audience_size?.toLocaleString() || '0'}</p>
          </div>
          <div>
              <p className="text-gray-600 mb-0.5">Niche</p>
              <p className="font-semibold text-indigo-600">{creator?.niche || 'Not set'}</p>
          </div>
        </div>
        )}

        {/* Show engagement metrics if available */}
        {creatorMetrics.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-100">
            {creatorMetrics.map((metric) => (
              <div key={`${metric.platform}-engagement`} className="space-y-1">
                <p className="text-xs text-gray-600">Avg Views (10 videos)</p>
                <p className="text-sm font-semibold text-gray-900">{metric.avg_views_10?.toLocaleString() || '0'}</p>
                {metric.engagement_rate_10 > 0 && (
                  <>
                    <p className="text-xs text-gray-600 mt-2">Engagement Rate</p>
                    <p className="text-sm font-semibold text-indigo-600">{metric.engagement_rate_10.toFixed(2)}%</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {creator?.platforms && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-gray-600 mb-2 text-xs">Platforms</p>
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(creator.platforms) ? creator.platforms : [creator.platforms]).map((platform, i) => (
                <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                  {platform}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Connected Social Accounts */}
      {socialAccounts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Connected Social Accounts</h3>
          <div className="space-y-2">
            {socialAccounts.map((account) => (
              <Card key={account.platform} padding="p-3" className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {account.platform === 'youtube' && <Youtube size={18} className="text-red-600" />}
                  {account.platform === 'tiktok' && (
                    <svg className="w-[18px] h-[18px] text-gray-900" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  )}
                  {account.platform === 'instagram' && <Instagram size={18} className="text-pink-600" />}
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{account.platform}</p>
                    {account.handle && (
                      <p className="text-xs text-gray-500">@{account.handle}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirm({ platform: account.platform, handle: account.handle })}
                  disabled={disconnecting === account.platform}
                  className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {disconnecting === account.platform ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <PhoneModal onClickBackdrop={() => setShowConfirm(null)}>
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Disconnect {showConfirm.platform}?</h3>
              <p className="text-sm text-gray-600">
                This will remove your {showConfirm.platform} account and all associated data. Your media kit will be updated automatically.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setShowConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  fullWidth
                  onClick={() => handleDisconnect(showConfirm.platform)}
                  disabled={disconnecting === showConfirm.platform}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {disconnecting === showConfirm.platform ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          </div>
        </PhoneModal>
      )}

      <div className="space-y-2">
        <button 
          type="button"
          onClick={onNavigateToSettings}
          className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-3">
            <Settings size={18} className="text-gray-600" />
            <span className="text-sm text-gray-900">Settings</span>
          </div>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <button 
          type="button"
          onClick={onShowPublicKit}
          className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <span className="text-sm text-gray-900">Share media kit</span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <button 
          type="button"
          onClick={onSignOut}
          className="w-full px-4 py-3 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all"
        >
          Sign out
        </button>
      </div>
    </Screen>
  );
};

// Main App Component
function ExlaApp() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [screen, setScreen] = useState<'connect' | 'app'>('connect');
  const [activeTab, setActiveTab] = useState('home');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPublicKit, setShowPublicKit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (user) {
      // User is authenticated - let OnboardingGuard handle routing
      // Don't force screen change here, let the guard redirect appropriately
      setScreen('app');
    } else {
      setScreen('connect');
    }
  }, [user, authLoading]);

  const handleSignOut = async () => {
    await signOut();
    setScreen('connect');
  };

  if (authLoading) {
    return (
      <div className="h-full w-full bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (showNotifications) {
    return <NotificationsScreen onClose={() => setShowNotifications(false)} />;
  }

  if (showPublicKit) {
    return (
      <SettingsProvider>
        <PublicMediaKit onClose={() => setShowPublicKit(false)} />
      </SettingsProvider>
    );
  }

  if (showSettings) {
    return (
      <SettingsProvider>
        <SettingsScreen onBack={() => setShowSettings(false)} onSignOut={handleSignOut} />
      </SettingsProvider>
    );
  }

  if (screen === 'connect') {
    return (
      <div className="h-full w-full bg-white flex flex-col">
        <ConnectAccount onConnect={() => setScreen('app')} />
      </div>
    );
  }

  // Tab title mapping
  const tabTitles: Record<string, string> = {
    home: 'Home',
    discover: 'Discover',
    ai: 'AI Assistant',
    deals: 'Pitches',
    profile: 'Profile',
  };

  // Refresh data silently when tab changes (handled in provider)

  const mainTabContent = (
    <div className="w-full h-full bg-white flex flex-col relative">
      <AppBar onNavigate={setActiveTab} />
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden">
        {activeTab === 'home' && <CreatorHome onNavigate={setActiveTab} onShowNotifications={() => setShowNotifications(true)} onShowMediaKit={() => setShowPublicKit(true)} />}
        {activeTab === 'discover' && <CreatorDiscover />}
        {activeTab === 'ai' && <CreatorAI />}
        {activeTab === 'deals' && <CreatorDeals onNavigate={setActiveTab} />}
        {activeTab === 'profile' && <CreatorProfile onSignOut={handleSignOut} onShowPublicKit={() => setShowPublicKit(true)} onNavigateToSettings={() => setShowSettings(true)} />}
      </div>
      <BottomNav active={activeTab} onNavigate={setActiveTab} />
    </div>
  );

  return (
    <SettingsProvider>
      <UserDataProvider userId={user?.id || null}>
        <AppGate tabContent={mainTabContent} />
      </UserDataProvider>
    </SettingsProvider>
  );
}

export default ExlaApp;
