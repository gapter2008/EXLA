#!/bin/bash

echo "🚀 TikTok OAuth ngrok Setup"
echo "=========================="
echo ""

# Check if Next.js is running
if ! lsof -ti:3000 > /dev/null 2>&1; then
    echo "⚠️  Warning: Nothing is running on port 3000"
    echo "   Please start your Next.js server first:"
    echo "   npm run dev"
    echo ""
    read -p "Press Enter to continue anyway, or Ctrl+C to cancel..."
fi

echo "Starting ngrok..."
echo ""
echo "📋 After ngrok starts, you'll see a URL like:"
echo "   https://abc123.ngrok.io"
echo ""
echo "📝 Next steps:"
echo "   1. Copy the HTTPS URL from ngrok"
echo "   2. Update .env.local: TIKTOK_REDIRECT_URI=https://YOUR-URL.ngrok.io/api/oauth/tiktok/callback"
echo "   3. Update TikTok Developer Portal with the same URL"
echo "   4. Restart your Next.js server"
echo ""
echo "Press Ctrl+C to stop ngrok when done"
echo ""

ngrok http 3000

