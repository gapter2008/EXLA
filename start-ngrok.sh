#!/bin/bash

# Start ngrok using the locally installed version

cd "$(dirname "$0")"

if [ -f "./node_modules/.bin/ngrok" ]; then
    echo "🚀 Starting ngrok with local installation..."
    ./node_modules/.bin/ngrok http 3000
elif command -v ngrok &> /dev/null; then
    echo "🚀 Starting ngrok (global installation)..."
    ngrok http 3000
else
    echo "❌ ngrok not found!"
    echo ""
    echo "Please install ngrok first:"
    echo "  1. Visit https://ngrok.com/download"
    echo "  2. Download for macOS"
    echo "  3. Unzip and move to /usr/local/bin/"
    echo ""
    echo "Or install via npm (requires sudo):"
    echo "  sudo npm install -g ngrok"
    exit 1
fi

