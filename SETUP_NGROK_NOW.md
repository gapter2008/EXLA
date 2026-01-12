# Quick ngrok Setup for TikTok OAuth

## ✅ ngrok is already installed!

Now let's get it working:

### Step 1: Authenticate ngrok (First time only)

ngrok requires a free account. Run this command:

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

To get your auth token:
1. Go to https://dashboard.ngrok.com/signup (sign up for free)
2. Copy your auth token from the dashboard
3. Run the command above

**OR** skip auth for now - ngrok v3 might work without it for basic usage.

---

### Step 2: Start your Next.js server

Make sure your dev server is running:

```bash
cd /Users/gapter/exla
npm run dev
```

Keep this running!

---

### Step 3: Start ngrok in a NEW terminal

Open a **new terminal window** and run:

```bash
ngrok http 3000
```

You should see:
```
Session Status                online
Account                       (your account)
Version                       3.34.1
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

---

### Step 4: Update .env.local

Edit `.env.local` and add/update this line:

```bash
TIKTOK_REDIRECT_URI=https://YOUR-NGROK-URL.ngrok.io/api/oauth/tiktok/callback
```

Replace `YOUR-NGROK-URL` with your actual ngrok URL.

---

### Step 5: Update TikTok Developer Portal

1. Go to https://developers.tiktok.com/
2. Open your app
3. Go to "Basic Information" or "Products" → "Login Kit"
4. Set Redirect URI to: `https://YOUR-NGROK-URL.ngrok.io/api/oauth/tiktok/callback`
5. Save

---

### Step 6: Restart your dev server

Stop (Ctrl+C) and restart:
```bash
npm run dev
```

---

### Step 7: Access via ngrok URL

**IMPORTANT:** Access your app through ngrok, NOT localhost:
- Visit: `https://YOUR-NGROK-URL.ngrok.io`
- Try connecting TikTok!

---

## Troubleshooting

**If ngrok says "authtoken required":**
- Sign up at https://dashboard.ngrok.com/signup
- Get your token and run: `ngrok config add-authtoken YOUR_TOKEN`

**If ngrok URL keeps changing:**
- That's normal with free ngrok
- Update `.env.local` and TikTok portal each time

**If you get "command not found":**
- Make sure ngrok is in your PATH: `which ngrok`
- If not, run: `sudo mv /path/to/ngrok /usr/local/bin/`

