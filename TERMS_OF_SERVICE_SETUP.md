# How to Create a Terms of Service URL for Discord Bot Verification

Discord requires a publicly accessible URL for your Terms of Service when verifying your bot. Here are several options:

## Option 1: GitHub (Easiest - Recommended)

If your bot code is on GitHub:

1. **Push the `TERMS_OF_SERVICE.md` file to your GitHub repository**
   ```bash
   git add TERMS_OF_SERVICE.md
   git commit -m "Add Terms of Service"
   git push
   ```

2. **Get the Raw GitHub URL:**
   - Go to your repository on GitHub
   - Click on `TERMS_OF_SERVICE.md`
   - Click the "Raw" button (top right)
   - Copy the URL from your browser

   The URL will look like:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/TERMS_OF_SERVICE.md
   ```
   or
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/master/TERMS_OF_SERVICE.md
   ```

3. **Use this URL in Discord Developer Portal:**
   - Go to https://discord.com/developers/applications
   - Select your bot application
   - Go to "General Information"
   - Paste the URL in the "Terms of Service URL" field

**Note:** Your repository must be public for this to work, OR you can use GitHub Pages (see Option 2).

---

## Option 2: GitHub Pages (Better Formatting)

For a nicely formatted HTML version:

1. **Create a GitHub Pages site:**
   - Go to your repository Settings → Pages
   - Select source branch (usually `main` or `master`)
   - Save

2. **GitHub will automatically render your markdown file**
   - Your Terms of Service will be accessible at:
   ```
   https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/TERMS_OF_SERVICE.html
   ```
   or if in root:
   ```
   https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/TERMS_OF_SERVICE
   ```

3. **Use this URL in Discord Developer Portal**

---

## Option 3: Simple Web Hosting

If you have a website or web hosting:

1. Upload `TERMS_OF_SERVICE.md` to your web server
2. Access it via: `https://yourdomain.com/TERMS_OF_SERVICE.md`
3. Or convert to HTML for better formatting

---

## Option 4: Free Static Hosting Services

You can use free services like:

- **Netlify Drop**: Drag and drop the file
- **Vercel**: Deploy from GitHub
- **GitHub Pages**: (see Option 2)
- **GitLab Pages**: Similar to GitHub Pages

---

## Quick Setup Commands (GitHub)

If you haven't pushed to GitHub yet:

```bash
# Initialize git (if not already done)
git init

# Add the Terms of Service file
git add TERMS_OF_SERVICE.md

# Commit
git commit -m "Add Terms of Service for Discord bot verification"

# Add your GitHub remote (replace with your actual repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git push -u origin main
```

Then follow Option 1 above to get the raw URL.

---

## Testing Your URL

Before submitting to Discord, test that your URL:
- ✅ Is publicly accessible (try opening in incognito/private browser)
- ✅ Returns the Terms of Service content
- ✅ Uses HTTPS (Discord requires HTTPS)
- ✅ Is accessible without authentication

---

## Discord Developer Portal Steps

1. Go to https://discord.com/developers/applications
2. Select your bot application
3. Navigate to "General Information" tab
4. Scroll down to "Terms of Service URL"
5. Paste your URL
6. Save changes
7. Proceed with bot verification

---

## Troubleshooting

**Issue: Discord says URL is invalid**
- Make sure the URL uses HTTPS (not HTTP)
- Ensure the file is publicly accessible
- Check that the URL returns actual content (not a 404)

**Issue: URL shows raw markdown**
- This is fine! Discord accepts markdown files
- If you want HTML formatting, use GitHub Pages (Option 2)

**Issue: Repository is private**
- Make the repository public, OR
- Use GitHub Pages (works with private repos if you have GitHub Pro/Team)
- Use a different hosting option (Option 3 or 4)

