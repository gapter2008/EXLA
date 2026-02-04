"use client";

import { useRouter } from 'next/navigation';
import { goOnboardingPush } from '@/lib/safeNavigate';
import { useOnboarding } from '@/context/OnboardingContext';
import { useState } from 'react';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, CheckCircle2, Music2, Youtube, Instagram } from 'lucide-react';

export default function OnboardingConnectPage() {
  const router = useRouter();
  const { advanceStep, profile } = useOnboarding();
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  const platforms = [
    { 
      id: 'tiktok', 
      name: 'TikTok', 
      icon: Music2, 
      available: true, 
      bgColor: 'bg-[#000000]',
      iconColor: 'text-white',
      connectUrl: '/api/oauth/tiktok/start'
    },
    { 
      id: 'youtube', 
      name: 'YouTube', 
      icon: Youtube, 
      available: true, 
      bgColor: 'bg-[#FF0000]',
      iconColor: 'text-white',
      connectUrl: '/api/oauth/youtube/start'
    },
    { 
      id: 'instagram', 
      name: 'Instagram', 
      icon: Instagram, 
      available: false, 
      bgColor: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#FD1D1D]',
      iconColor: 'text-white'
    },
  ];

  const handlePlatformConnect = async (platformId: string, connectUrl?: string) => {
    if (!connectUrl) return;
    
    setConnecting(platformId);
    try {
      // Start OAuth flow
      window.location.href = connectUrl;
    } catch (err) {
      console.error(`Error starting ${platformId} OAuth:`, err);
      setConnecting(null);
    }
  };

  const isConnected = (platformId: string) => connectedPlatforms.includes(platformId);
  const hasConnections = connectedPlatforms.length > 0;

  const handleContinue = async () => {
    if (!hasConnections) return;
    // Navigate to scanning - the OAuth callback will handle starting the scan
    goOnboardingPush(router, 'scanning');
  };

  return (
    <OnboardingPageGuard>
      <div className="min-h-screen bg-white flex flex-col px-6 py-12">
        {/* Step Indicator */}
        <p className="text-[12px] text-[#64748B] uppercase tracking-[0.06em] mb-6">
          Step 3 of 3
        </p>

        <button onClick={() => router.back()} className="mb-12 flex items-center gap-2 text-[#64748B]">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <h1 className="text-[28px] font-semibold text-[#0F172A] mb-3">
            Connect your platforms
          </h1>
          
          <p className="text-[15px] text-[#64748B] mb-12">
            We'll analyze your content and help you find brand deals
          </p>

          <div className="space-y-4 mb-6">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              const connected = isConnected(platform.id);
              
              return (
                <button
                  key={platform.id}
                  onClick={() => platform.available && platform.connectUrl && handlePlatformConnect(platform.id, platform.connectUrl)}
                  disabled={!platform.available || connecting === platform.id}
                  className={`w-full h-[68px] rounded-[18px] px-5 flex items-center justify-between transition-all ${
                    platform.available
                      ? 'bg-white border border-[rgba(0,0,0,0.08)] shadow-sm hover:shadow-md active:scale-[0.98]'
                      : 'bg-white border border-[rgba(0,0,0,0.04)] opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-[12px] ${platform.bgColor} flex items-center justify-center ${!platform.available ? 'opacity-50' : ''}`}>
                      <Icon className={`w-[28px] h-[28px] ${platform.iconColor}`} strokeWidth={2} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[16px] font-semibold text-[#0F172A]">
                        {platform.name}
                      </span>
                      {connected && (
                        <span className="text-[12px] text-green-600 font-medium">
                          Connected
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {!platform.available ? (
                    <span className="text-[13px] text-[#94A3B8] font-medium">Coming soon</span>
                  ) : connected ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : connecting === platform.id ? (
                    <span className="w-5 h-5 border-2 border-[#0F172A] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Connected Platforms Feedback */}
          <div className="text-center mb-8">
            {hasConnections && (
              <p className="text-[13px] font-semibold text-[#0F172A] mb-2">
                {connectedPlatforms.length} platform{connectedPlatforms.length > 1 ? 's' : ''} connected
              </p>
            )}
            <p className="text-[13px] text-[#64748B]">
              Connected platforms will be scanned automatically
            </p>
          </div>
        </div>

        {/* Continue Action */}
        <div className="space-y-3">
          <Button 
            variant="primary" 
            className="w-full"
            disabled={!hasConnections}
            onClick={handleContinue}
          >
            Continue & Analyze
          </Button>
          
          <p className="text-[12px] text-[#94A3B8] text-center">
            You can connect more platforms later in settings
          </p>
        </div>
      </div>
    </OnboardingPageGuard>
  );
}

