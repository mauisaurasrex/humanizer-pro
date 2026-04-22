# Humanizer Pro — Deployment Guide

## Deploy to Vercel (free, ~2 minutes)

### Step 1: Install Node.js
Go to https://nodejs.org and download the LTS version. Install it.

### Step 2: Create a GitHub account
Go to https://github.com and sign up (free).

### Step 3: Create a new GitHub repository
1. Click the "+" button top right → "New repository"
2. Name it: `humanizer-pro`
3. Set it to **Public**
4. Click "Create repository"

### Step 4: Upload these files to GitHub
1. On your new repo page, click "uploading an existing file"
2. Drag ALL the files from this folder into the upload area
   - Make sure to keep the folder structure: `src/` folder with `App.jsx` and `main.jsx` inside
3. Click "Commit changes"

### Step 5: Deploy to Vercel
1. Go to https://vercel.com and sign up with your GitHub account
2. Click "Add New Project"
3. Find and select your `humanizer-pro` repository
4. Vercel will auto-detect it as a Vite project
5. Click "Deploy" — that's it!

### Step 6: Your site is live!
Vercel gives you a free URL like: `humanizer-pro.vercel.app`
You can share this with your friends.

---

## ⚠️ Important: API Key
The app uses the Anthropic API which is accessed via Claude.ai's artifact renderer.
For a standalone website you'll need your own Gemini API key.

### Getting an API key:
1. Go to https://aistudio.google.com
2. Sign up for a free account
3. Go to "API Keys" and create a new key
4. In `src/App.jsx`, find this line:
   ```
   headers: { "Content-Type": "application/json" },
   ```
   And change it to:
   ```
   headers: { 
     "Content-Type": "application/json",
     "x-api-key": "YOUR_API_KEY_HERE",
     "anthropic-version": "2023-06-01"
   },
   ```
   Replace `YOUR_API_KEY_HERE` with your actual key.

### Keep your key safe:
Instead of putting the key directly in the code, use a Vercel environment variable:
1. In Vercel dashboard → your project → Settings → Environment Variables
2. Add: `VITE_GEMINI_KEY` = your API key
3. In App.jsx use: `import.meta.env.VITE_GEMINI_KEY`

---

## Running locally (optional)
```
npm install
npm run dev
```
Then open http://localhost:5173
