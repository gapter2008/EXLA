#!/bin/bash

# TikTok OAuth Setup Script
# This script helps you set up ngrok for TikTok OAuth development

echo "🔧 TikTok OAuth Setup"
echo "===================="
echo ""

# Check if ngrok is installed
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok is already installed"
    ngrok version
else
    echo "❌ ngrok is not installed"
    echo ""
    echo "Please install ngrok using one of these methods:"
    echo ""
    echo "Option 1: Install via Homebrew (recommended)"
    echo "  brew install ngrok"
    echo ""
    echo "Option 2: Download manually"
    echo "  1. Visit: https://ngrok.com/download"
    echo "  2. Download for macOS"
    echo "  3. Unzip and move to /usr/local/bin/"
    echo ""
    echo "Option 3: Install via npm (if you have Node.js)"
    echo "  npm install -g ngrok"
    echo ""
    read -p "Press Enter after installing ngrok, or Ctrl+C to cancel..."
fi

echo ""
echo "📝 Next steps:"
echo "1. Start your Next.js dev server in one terminal:"
echo "   npm run dev"
echo ""
echo "2. Start ngrok in another terminal:"
echo "   ngrok http 3000"
echo ""
echo "3. Copy the HTTPS URL from ngrok (e.g., https://abc123.ngrok.io)"
echo ""
echo "4. Run this command to update .env.local:"
echo "   ./update-ngrok-url.sh YOUR_NGROK_URL"
echo ""
echo "5. Update TikTok Developer Portal with the ngrok URL + /api/oauth/tiktok/callback"
echo ""

