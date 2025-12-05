# Discord Bot Token Troubleshooting Guide

## 🤔 Should You Get a New Token?

**Before getting a new token, follow these steps:**

### Step 1: Test Your Current Token Locally

1. Make sure you have your bot token (from Discord Developer Portal or your `.env` file)
2. Run the verification script:
   ```bash
   node verify-token.js
   ```
   
   Or if your token is in `.env`:
   ```bash
   node verify-token.js
   ```
   
   Or pass the token directly:
   ```bash
   node verify-token.js YOUR_TOKEN_HERE
   ```

### Step 2: Check the Results

#### ✅ If Token Test PASSES:
- Your token is **valid**
- The problem is likely with how it's set in Render
- **DO NOT** get a new token yet!
- Check Render environment variables (see below)

#### ❌ If Token Test FAILS:
- Your token is **invalid or expired**
- **YES, you need a new token** (see instructions below)

---

## 🔍 Check Render Environment Variables

If your token works locally but not on Render:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your bot service
3. Go to **Environment** tab
4. Check `BOT_TOKEN`:
   - ✅ Is it set? (should show "••••••••")
   - ✅ Does it match your local token exactly?
   - ✅ No extra spaces before/after?
   - ✅ No quotes around it?
   - ✅ Copied completely (tokens are ~70 characters)

5. If you see any issues:
   - Click **Edit** on `BOT_TOKEN`
   - Copy your token fresh from Discord Developer Portal
   - Paste it (no quotes, no spaces)
   - Save
   - Restart your service

---

## 🔑 When You DO Need a New Token

Only generate a new token if:
- ✅ Token test fails locally
- ✅ Token has been reset/regenerated in Discord Developer Portal
- ✅ Bot application was deleted and recreated

### How to Get a New Token:

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Click **"Bot"** in the left sidebar
4. Scroll down to **"Token"** section
5. Click **"Reset Token"** (if you want a fresh one) or **"Copy"** (if you just need the current one)
6. ⚠️ **Important**: When you reset a token, the old one stops working immediately!
7. Copy the new token
8. Update it in:
   - Your local `.env` file (if testing locally)
   - Render dashboard → Environment → `BOT_TOKEN`
9. Restart your Render service

---

## 📊 After Deploying the Updated Code

Once you deploy the code with better error handling, you'll see clearer error messages in Render logs:

- ❌ **"BOT_TOKEN is missing or empty"** → Set it in Render dashboard
- ❌ **"BOT_TOKEN appears to be invalid"** → Check token format
- ❌ **"Connection timeout"** → Token might be invalid or network issue
- ❌ **"Failed to login"** with error details → Check the specific error

---

## 🎯 Quick Decision Tree

```
Start here
    ↓
Test token locally (node verify-token.js)
    ↓
    ├─→ ✅ Token works locally
    │       ↓
    │   Check Render environment variable
    │       ↓
    │       ├─→ Token matches → Check other issues (network, etc.)
    │       └─→ Token doesn't match → Update Render env var
    │
    └─→ ❌ Token fails locally
            ↓
        Get new token from Discord Developer Portal
            ↓
        Update both local .env and Render dashboard
            ↓
        Restart services and test again
```

---

## 🆘 Still Having Issues?

If you've tried everything above:

1. Check Render logs for the new error messages (after deploying updated code)
2. Verify bot is still in your Discord server
3. Check if Discord API is having issues: https://discordstatus.com
4. Make sure bot has proper intents enabled in Discord Developer Portal

---

## 💡 Pro Tips

- **Never share your token** publicly (it's like a password)
- **Don't commit tokens** to Git (use `.env` files)
- **Reset token immediately** if you think it's been leaked
- **Copy token carefully** - they're long and one wrong character breaks it

