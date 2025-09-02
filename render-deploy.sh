#!/bin/bash

echo "🚀 Starting Render deployment process..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy commands
echo "📝 Deploying commands to Discord..."
node deploy-commands.js

# Start the bot
echo "🤖 Starting bot..."
node index.js
