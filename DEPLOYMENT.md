# Render Deployment Guide for Albion Assistance Bot

## 🚀 Quick Deploy to Render

### Option 1: One-Click Deploy (Recommended)
1. Click the "Deploy to Render" button below
2. Connect your GitHub account
3. Set up environment variables (see below)
4. Deploy!

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Option 2: Manual Deploy
1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure as shown below

## ⚙️ Environment Variables Setup

In your Render dashboard, add these environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `BOT_TOKEN` | `your_discord_bot_token` | Your Discord bot token |
| `APPLICATION_ID` | `your_application_id` | Your Discord application ID |
| `GUILD_ID` | `your_guild_id` | Your Discord server ID |
| `MONGODB_URI` | `your_mongodb_connection_string` | Your MongoDB Atlas connection string |
| `DATABASE_NAME` | `albion_assistance` | Database name (default) |
| `NODE_ENV` | `production` | Environment setting |

## 🔧 Render Configuration

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (or upgrade for better performance)

## 📋 Pre-Deployment Checklist

- [ ] Bot token is valid and has proper permissions
- [ ] MongoDB Atlas database is accessible from external IPs
- [ ] All environment variables are set correctly
- [ ] Bot is added to your Discord server with proper permissions

## 🔍 Troubleshooting

### Common Issues:

1. **Bot not responding**: Check if environment variables are set correctly
2. **Database connection failed**: Verify MongoDB URI and network access
3. **Commands not working**: Run deploy-commands.js locally first to register commands

### Logs:
- Check Render logs in the dashboard
- Monitor bot console output for errors

## 🆘 Support

If you encounter issues:
1. Check the logs in Render dashboard
2. Verify all environment variables are set
3. Ensure your bot has proper Discord permissions
4. Test database connectivity

## 🔄 Updates

To update your bot:
1. Push changes to GitHub
2. Render will automatically redeploy
3. Monitor logs for any issues
