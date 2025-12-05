/**
 * Quick script to verify if a Discord bot token is valid
 * Run this locally with: node verify-token.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const token = process.env.BOT_TOKEN || process.argv[2];

if (!token) {
    console.error('❌ No token provided!');
    console.error('Usage: node verify-token.js [TOKEN]');
    console.error('Or set BOT_TOKEN in .env file');
    process.exit(1);
}

console.log('🔐 Testing Discord bot token...\n');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

let resolved = false;
const timeout = setTimeout(() => {
    if (!resolved) {
        console.error('❌ Connection timeout (30 seconds)');
        console.error('   This usually means:');
        console.error('   - Invalid or expired token');
        console.error('   - Bot has been deleted');
        console.error('   - Network connectivity issues');
        client.destroy();
        process.exit(1);
    }
}, 30000);

client.once('ready', () => {
    resolved = true;
    clearTimeout(timeout);
    console.log('✅ TOKEN IS VALID!');
    console.log(`🤖 Bot name: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`📊 Connected to ${client.guilds.cache.size} server(s)`);
    console.log('\n✅ Your token is working correctly!');
    console.log('💡 If the bot still doesn\'t work on Render, check:');
    console.log('   1. Environment variable is set correctly in Render dashboard');
    console.log('   2. No extra spaces or quotes in the token');
    console.log('   3. The token matches exactly what you have locally');
    client.destroy();
    process.exit(0);
});

client.on('error', (error) => {
    resolved = true;
    clearTimeout(timeout);
    console.error('❌ TOKEN IS INVALID!');
    console.error('Error:', error.message);
    console.error('\n💡 You need to generate a new token:');
    console.error('   1. Go to https://discord.com/developers/applications');
    console.error('   2. Select your application');
    console.error('   3. Go to "Bot" section');
    console.error('   4. Click "Reset Token" or "Copy"');
    console.error('   5. Update BOT_TOKEN in Render dashboard');
    client.destroy();
    process.exit(1);
});

client.login(token).catch((error) => {
    resolved = true;
    clearTimeout(timeout);
    console.error('❌ FAILED TO LOGIN!');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    
    if (error.message.includes('Invalid') || error.message.includes('token')) {
        console.error('\n💡 This means your token is INVALID or EXPIRED');
        console.error('   You need to generate a new token from Discord Developer Portal');
    } else {
        console.error('\n💡 This might be a network issue or invalid token');
    }
    process.exit(1);
});

