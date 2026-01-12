#!/bin/bash

# Update .env.local with ngrok URL for TikTok OAuth

if [ -z "$1" ]; then
    echo "❌ Usage: ./update-ngrok-url.sh https://your-ngrok-url.ngrok.io"
    exit 1
fi

NGROK_URL="$1"
REDIRECT_URI="${NGROK_URL}/api/oauth/tiktok/callback"

echo "🔧 Updating .env.local with TikTok redirect URI..."
echo "   Redirect URI: $REDIRECT_URI"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    exit 1
fi

# Update or add TIKTOK_REDIRECT_URI
if grep -q "^TIKTOK_REDIRECT_URI=" .env.local; then
    # Update existing line
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^TIKTOK_REDIRECT_URI=.*|TIKTOK_REDIRECT_URI=$REDIRECT_URI|" .env.local
    else
        # Linux
        sed -i "s|^TIKTOK_REDIRECT_URI=.*|TIKTOK_REDIRECT_URI=$REDIRECT_URI|" .env.local
    fi
    echo "✅ Updated TIKTOK_REDIRECT_URI in .env.local"
else
    # Add new line
    echo "" >> .env.local
    echo "TIKTOK_REDIRECT_URI=$REDIRECT_URI" >> .env.local
    echo "✅ Added TIKTOK_REDIRECT_URI to .env.local"
fi

echo ""
echo "📋 Next steps:"
echo "1. Update TikTok Developer Portal:"
echo "   - Go to https://developers.tiktok.com/"
echo "   - Open your app"
echo "   - Set Redirect URI to: $REDIRECT_URI"
echo ""
echo "2. Restart your Next.js dev server:"
echo "   npm run dev"
echo ""
echo "3. Access your app via the ngrok URL (not localhost)"
echo ""

