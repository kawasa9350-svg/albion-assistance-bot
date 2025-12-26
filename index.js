const { Client, Collection, GatewayIntentBits, Events, InteractionType, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dns = require('dns');

// Fix DNS resolution on some hosting providers (prefer IPv4)
dns.setDefaultResultOrder('ipv4first');

const DatabaseManager = require('./database.js');

// Load configuration
const config = require('./config.js');

// Create Discord client with required intents
// IMPORTANT: These intents must also be enabled in Discord Developer Portal:
// https://discord.com/developers/applications -> Your Bot -> Bot -> Privileged Gateway Intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,              // Required for guild events
        GatewayIntentBits.GuildMessages,        // Required for message events (MessageDelete)
        GatewayIntentBits.GuildVoiceStates     // Required for voice channel features
    ]
});

// Create collections for commands
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize database manager
const dbManager = new DatabaseManager();

// Store pending alliance loot splits for confirmation/cancellation
// Key: splitId (timestamp-based), Value: { guildId, userIds, amounts, splitData }
client.pendingAllianceSplits = new Map();

// Load commands
console.log('📦 Loading commands...');
const commandsPath = path.join(__dirname, 'commands');
let commandFiles;
try {
    commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    console.log(`Found ${commandFiles.length} command files`);
} catch (error) {
    console.error('❌ Failed to read commands directory:', error);
    process.exit(1);
}

let loadedCommands = 0;
let failedCommands = 0;

for (const file of commandFiles) {
    try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            // Pass the database manager to the command
            command.dbManager = dbManager;
            client.commands.set(command.data.name, command);
            loadedCommands++;
            console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠️ Command at ${filePath} is missing required properties (data or execute)`);
            failedCommands++;
        }
    } catch (error) {
        console.error(`❌ Failed to load command ${file}:`, error.message);
        failedCommands++;
    }
}

console.log(`📊 Command loading complete: ${loadedCommands} loaded, ${failedCommands} failed`);

// Bot ready event
client.once(Events.ClientReady, async () => {
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
    
    // Connect to database
    console.log('📊 Attempting to connect to database...');
    const dbConnected = await dbManager.connect();
    if (dbConnected) {
        console.log('✅ Database connection established');
        
        // Load data in background (non-blocking) to speed up startup
        // Don't await - let it load in the background
        loadAllEventSignupsForAllGuilds().catch(err => {
            console.error('❌ Error loading event signups:', err);
        });
        
        loadAllVoiceChannelSetups().catch(err => {
            console.error('❌ Error loading voice channel setups:', err);
        });
    } else {
        console.error('❌ Failed to connect to database - bot will continue but database features may not work');
    }
    
    // Set bot status
    client.user.setActivity('𓆩𖤍𓆪 Phoenix Rebels 𓆩𖤍𓆪', { type: 'WATCHING' });
    
    // Cleanup old pending alliance splits (older than 24 hours)
    setInterval(() => {
        const now = new Date();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        let cleaned = 0;
        
        for (const [splitId, split] of client.pendingAllianceSplits.entries()) {
            if (now - split.createdAt > maxAge) {
                client.pendingAllianceSplits.delete(splitId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} expired pending alliance splits`);
        }
    }, 60 * 60 * 1000); // Run every hour
    
    console.log('✅ Bot initialization complete');
    console.log(`📊 Loaded ${client.commands.size} commands`);
    console.log(`🔧 MessageDelete event handlers: ${client.listenerCount(Events.MessageDelete)}`);
});

// Helper function to load all event signups for all guilds
async function loadAllEventSignupsForAllGuilds() {
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) console.log('🔄 Loading all event signups for all guilds...');
        
        // Initialize event signups storage if it doesn't exist
        if (!client.eventSignups) {
            client.eventSignups = new Map();
        }
        
        // Get all guilds the bot is in
        const guilds = client.guilds.cache;
        if (isDev) console.log(`Found ${guilds.size} guilds`);
        
        // Load event signups for each guild in parallel (faster)
        const loadPromises = Array.from(guilds.entries()).map(async ([guildId, guild]) => {
            try {
                // Get all events for this guild
                const events = await dbManager.getEvents(guildId);
                if (isDev && events.length > 0) {
                    console.log(`Loading signups for ${events.length} events in guild: ${guild.name}`);
                }
                
                // Load signups for each event
                for (const event of events) {
                    const existingSignups = await dbManager.getEventSignups(guildId, event.name);
                    existingSignups.forEach((signups, key) => {
                        client.eventSignups.set(key, signups);
                    });
                }
            } catch (error) {
                console.error(`Error loading event signups for guild ${guild.name}:`, error);
            }
        });
        
        await Promise.all(loadPromises);
        
        if (isDev) console.log(`✅ Total signup entries loaded across all guilds: ${client.eventSignups.size}`);
    } catch (error) {
        console.error('Error loading all event signups for all guilds:', error);
    }
}

// Helper function to load all voice channel setups for all guilds
async function loadAllVoiceChannelSetups() {
    try {
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) console.log('🔄 Loading all voice channel setups for all guilds...');
        
        // Initialize voice channel setups storage if it doesn't exist
        if (!client.voiceChannelSetups) {
            client.voiceChannelSetups = new Map();
        }
        
        // Initialize temporary channels tracking if it doesn't exist
        if (!client.temporaryChannels) {
            client.temporaryChannels = new Map();
        }
        
        // Get all guilds the bot is in
        const guilds = client.guilds.cache;
        
        // Load voice channel setups in parallel (faster)
        const loadPromises = Array.from(guilds.entries()).map(async ([guildId, guild]) => {
            try {
                const setup = await dbManager.getVoiceChannelSetup(guildId);
                if (setup) {
                    client.voiceChannelSetups.set(guildId, setup);
                    if (isDev) console.log(`Loaded voice channel setup for guild: ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error loading voice channel setup for guild ${guild.name}:`, error);
            }
        });
        
        await Promise.all(loadPromises);
        
        if (isDev) console.log(`✅ Total voice channel setups loaded: ${client.voiceChannelSetups.size}`);
    } catch (error) {
        console.error('Error loading all voice channel setups for all guilds:', error);
    }
}

// Message delete event - handle cleanup of signup and event data when messages are deleted
client.on(Events.MessageDelete, async (message) => {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) console.log(`🔍 MESSAGE DELETE EVENT TRIGGERED - Message ID: ${message.id}`);
    
    try {
        if (isDev) {
            console.log(`🔍 Message deletion detected:`, {
                messageId: message.id,
                guildId: message.guildId,
                channelId: message.channelId,
                authorId: message.author?.id,
                isBotMessage: message.author?.id === client.user.id,
                hasEmbeds: message.embeds && message.embeds.length > 0,
                embedTitle: message.embeds?.[0]?.title || 'No title'
            });
        }
        
        // Check if this is a message from our bot
        if (message.author && message.author.id === client.user.id && 
            message.embeds && message.embeds.length > 0) {
            
            const embed = message.embeds[0];
            const title = embed.title || '';
            
            if (isDev) console.log(`📝 Processing bot message deletion with title: "${title}"`);
            
            // Handle signup message deletion
            if (title.startsWith('📝 Build Signup')) {
                if (isDev) console.log('Signup message deleted, cleaning up database signups');
                
                // Extract composition name and session ID from the embed description
                const description = embed.description || '';
                const compNameMatch = description.match(/\*\*(.*?)\*\* - Available Builds/);
                
                if (compNameMatch && compNameMatch[1]) {
                    const compName = compNameMatch[1];
                    
                    // Try to find the session ID from the message content or components
                    let sessionId = null;
                    if (message.components && message.components.length > 0) {
                        // Look for session ID in button custom IDs
                        for (const row of message.components) {
                            for (const component of row.components) {
                                if (component.customId && component.customId.startsWith('signup_comp_')) {
                                    const parts = component.customId.split('_');
                                    if (parts.length >= 4) {
                                        sessionId = parts[3]; // sessionId is the 4th part
                                        break;
                                    }
                                }
                            }
                            if (sessionId) break;
                        }
                    }
                    
                    if (sessionId) {
                        if (isDev) console.log(`Cleaning up signups for composition: ${compName}, session: ${sessionId}`);
                        
                        // Clean up signups for this specific session from database
                        await dbManager.cleanupCompositionSignups(message.guildId, compName, sessionId);
                        
                        // Also clean up from memory
                        if (client.eventSignups) {
                            for (const [key] of client.eventSignups) {
                                if (key.startsWith(`comp_${compName}_${sessionId}_`)) {
                                    client.eventSignups.delete(key);
                                }
                            }
                        }
                        
                        if (isDev) console.log(`✅ Cleaned up signups for composition: ${compName}, session: ${sessionId}`);
                    } else {
                        if (isDev) console.log(`Could not determine session ID for composition: ${compName}, cleaning up all signups`);
                        
                        // Fallback: clean up all signups for this composition from database
                        await dbManager.cleanupCompositionSignups(message.guildId, compName);
                        
                        // Also clean up from memory
                        if (client.eventSignups) {
                            for (const [key] of client.eventSignups) {
                                if (key.startsWith(`comp_${compName}_`)) {
                                    client.eventSignups.delete(key);
                                }
                            }
                        }
                        
                        if (isDev) console.log(`✅ Cleaned up all signups for composition: ${compName}`);
                    }
                }
            }
            
            // Handle event message deletion
            else if (title.includes('📅') || title.includes('**') || title.toLowerCase().includes('event')) {
                if (isDev) {
                    console.log('🎯 EVENT MESSAGE DELETION DETECTED!');
                    console.log('Event message deleted, cleaning up database event and signups');
                    console.log(`Message details: Guild ID: ${message.guildId}, Title: "${title}"`);
                }
                
                // Extract event name from the title (format: "📅 **Event Name**")
                let eventName = null;
                
                // Try multiple patterns to extract event name
                const patterns = [
                    /\*\*(.*?)\*\*/, // **Event Name**
                    /📅\s*\*\*(.*?)\*\*/, // 📅 **Event Name**
                    /📅\s*(.+)/, // 📅 Event Name (without **)
                    /(.+)/ // Any text as fallback
                ];
                
                for (const pattern of patterns) {
                    const match = title.match(pattern);
                    if (match && match[1] && match[1].trim()) {
                        eventName = match[1].trim();
                        if (isDev) console.log(`Extracted event name using pattern ${pattern.source}: "${eventName}"`);
                        break;
                    }
                }
                
                if (eventName) {
                    if (isDev) {
                        console.log(`Final extracted event name: "${eventName}"`);
                        console.log(`Cleaning up event and signups for event: ${eventName} in guild: ${message.guildId}`);
                    }
                    
                    try {
                        // First, verify the event exists in the database
                        const events = await dbManager.getEvents(message.guildId);
                        const eventExists = events.find(e => e.name === eventName);
                        
                        if (eventExists) {
                            // Clean up event signups from database
                            const signupCleanupResult = await dbManager.cleanupEventSignups(message.guildId, eventName);
                            
                            // Delete the event itself from database
                            const deleteResult = await dbManager.deleteEvent(message.guildId, eventName);
                            
                            // Also clean up from memory if it exists
                            if (client.eventSignups) {
                                for (const [key] of client.eventSignups) {
                                    if (key.startsWith(`event_${eventName}_`)) {
                                        client.eventSignups.delete(key);
                                    }
                                }
                            }
                            
                            if (isDev) console.log(`✅ Cleaned up event and signups for event: ${eventName}`);
                        } else {
                            if (isDev) console.log(`⚠️ Event "${eventName}" not found in database, trying fuzzy search...`);
                            
                            // Try fuzzy search through all events to find a match
                            const allEvents = await dbManager.getEvents(message.guildId);
                            const fuzzyMatch = allEvents.find(e => 
                                e.name.toLowerCase().includes(eventName.toLowerCase()) ||
                                eventName.toLowerCase().includes(e.name.toLowerCase())
                            );
                            
                            if (fuzzyMatch) {
                                eventName = fuzzyMatch.name; // Use the actual event name from database
                                
                                // Retry cleanup with the correct event name
                                try {
                                    await dbManager.cleanupEventSignups(message.guildId, eventName);
                                    await dbManager.deleteEvent(message.guildId, eventName);
                                    if (isDev) console.log(`✅ Fuzzy match cleanup successful for event: ${eventName}`);
                                } catch (fuzzyError) {
                                    console.error(`❌ Fuzzy match cleanup error:`, fuzzyError);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error cleaning up event ${eventName}:`, error);
                        
                        // Even if there's an error, try to force delete the event
                        try {
                            await dbManager.deleteEvent(message.guildId, eventName);
                        } catch (forceError) {
                            console.error(`❌ Force deletion error:`, forceError);
                        }
                    }
                } else {
                    if (isDev) console.log(`⚠️ Could not extract event name from title: "${title}"`);
                    
                    // Last resort: try to find any event that might match the title
                    try {
                        const allEvents = await dbManager.getEvents(message.guildId);
                        
                        // Look for any event that might be in the title
                        for (const event of allEvents) {
                            if (title.toLowerCase().includes(event.name.toLowerCase())) {
                                await dbManager.deleteEvent(message.guildId, event.name);
                                if (isDev) console.log(`✅ Last resort deletion successful for event: ${event.name}`);
                                break;
                            }
                        }
                    } catch (lastResortError) {
                        console.error(`❌ Last resort event search error:`, lastResortError);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error handling message delete for cleanup:', error);
    }
});

// Voice state update event - handle join-to-create voice channels
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
        // Get the voice channel command to handle the voice state update
        const voiceChannelCommand = client.commands.get('voice-channel');
        if (voiceChannelCommand && voiceChannelCommand.handleVoiceStateUpdate) {
            await voiceChannelCommand.handleVoiceStateUpdate(oldState, newState, client);
        }
    } catch (error) {
        console.error('❌ Error handling voice state update:', error);
    }
});

// Channel delete event - clean up temporary channel tracking
client.on(Events.ChannelDelete, async (channel) => {
    try {
        if (channel.type === ChannelType.GuildVoice && channel.guild) {
            const temporaryChannels = client.temporaryChannels?.get(channel.guild.id);
            if (temporaryChannels && temporaryChannels.has(channel.id)) {
                temporaryChannels.delete(channel.id);
                console.log(`🧹 Cleaned up tracking for deleted temporary channel: ${channel.name} (ID: ${channel.id})`);
            }
        }
    } catch (error) {
        console.error('❌ Error handling channel delete:', error);
    }
});

// Interaction create event (slash commands, buttons, modals)
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // Handle slash commands
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            await command.execute(interaction, command.dbManager);
        } else if (interaction.isButton()) {
            // Handle button interactions
            await client.handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            // Handle modal submissions
            await client.handleModalSubmit(interaction);
        } else if (interaction.isStringSelectMenu()) {
            // Handle select menu interactions
            await client.handleSelectMenuInteraction(interaction);
        } else if (interaction.isAutocomplete()) {
            // Handle autocomplete interactions
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            if (command.autocomplete) {
                await command.autocomplete(interaction);
            }
        }
    } catch (error) {
        // Check if interaction expired (code 10062)
        if (error.code === 10062) {
            console.warn(`Interaction expired or unknown (type: ${interaction.type})`);
            return;
        }
        
        console.error(`Error handling interaction:`, error);
        
        // Autocomplete interactions can't use reply/followUp, only respond (and only within 3 seconds)
        if (interaction.isAutocomplete()) {
            // If it's an autocomplete interaction that failed, we can't send error messages
            // The error is already logged above
            return;
        }
        
        const errorMessage = {
            content: 'There was an error while processing this interaction!',
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            // If reply also fails, check if it's an expired interaction
            if (replyError.code === 10062) {
                console.warn('Failed to send error message: interaction expired or unknown');
            } else {
                // Only log as error if it's not an expired interaction
                console.error('Failed to send error message to user:', replyError);
            }
        }
    }
});

// Handle button interactions
client.handleButtonInteraction = async (interaction) => {
    console.log(`Button clicked: ${interaction.customId} by user ${interaction.user.id}`);
    console.log(`Interaction type: ${interaction.type}, isButton: ${interaction.isButton()}`);
    
    // Find the command that created this button by checking custom IDs
    const customId = interaction.customId;
    
    // Check for build-edit pagination buttons first (before general build_ check)
    if (customId === 'build_edit_prev_page' || customId === 'build_edit_next_page') {
        console.log('Build edit pagination button detected, routing to build-edit command');
        
        // This is a build edit pagination button
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handlePaginationButton) {
            await buildEditCommand.handlePaginationButton(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handlePaginationButton method not found');
        }
    } else if (customId.startsWith('build_') || customId === 'weapon' || customId === 'offhand' || 
        customId === 'cape' || customId === 'head' || customId === 'chest' || 
        customId === 'shoes' || customId === 'food' || customId === 'potion' || 
        customId === 'content_type' || customId === 'create_build' || customId === 'cancel_build') {
        
        console.log('Build button detected, routing to build command');
        
        // This is a build creation button
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleButtonInteraction) {
            await buildCommand.handleButtonInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleButtonInteraction method not found');
        }
    } else if (customId.startsWith('delete_') || customId === 'confirm_delete_build') {
        console.log('Delete button detected, routing to build command');
        
        // This is a delete button
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleDeleteInteraction) {
            await buildCommand.handleDeleteInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleDeleteInteraction method not found');
        }
    } else if (customId.startsWith('comp_')) {
        console.log('Comp button detected, routing to comp command');
        
        // Check if this is a comp delete interaction
        if (customId.startsWith('comp_delete_') || customId === 'comp_confirm_delete' || customId === 'comp_cancel_delete') {
            console.log('Comp delete interaction detected, routing to comp delete handler');
            const compCommand = client.commands.get('comp');
            if (compCommand && compCommand.handleDeleteInteraction) {
                await compCommand.handleDeleteInteraction(interaction, compCommand.dbManager);
            } else {
                console.error('Comp command or handleDeleteInteraction method not found');
            }
        } else {
            // This is a regular comp button
            const compCommand = client.commands.get('comp');
            if (compCommand && compCommand.handleButtonInteraction) {
                await compCommand.handleButtonInteraction(interaction, compCommand.dbManager);
            } else {
                console.error('Comp command or handleButtonInteraction method not found');
            }
        }
    } else if (customId.startsWith('event_')) {
        console.log('Event button detected, routing to event command');
        
        // Check if this is a build signup button
        if (customId.startsWith('event_signup_')) {
            console.log('Event signup button detected, routing to event signup handler');
            const eventCommand = client.commands.get('event');
            if (eventCommand && eventCommand.handleBuildSignup) {
                await eventCommand.handleBuildSignup(interaction, eventCommand.dbManager);
            } else {
                console.error('Event command or handleBuildSignup method not found');
            }
        } else {
            // This is a regular event button
            const eventCommand = client.commands.get('event');
            if (eventCommand && eventCommand.handleButtonInteraction) {
                await eventCommand.handleButtonInteraction(interaction, eventCommand.dbManager);
            } else {
                console.error('Event command or handleButtonInteraction method not found');
            }
        }
    } else if (customId.startsWith('signup_comp_')) {
        console.log('Signup button detected, routing to signup command');
        
        // This is a signup build button
        const signupCommand = client.commands.get('signup');
        if (signupCommand && signupCommand.handleBuildSignup) {
            await signupCommand.handleBuildSignup(interaction, signupCommand.dbManager);
        } else {
            console.error('Signup command or handleBuildSignup method not found');
        }
    } else if (customId.startsWith('confirm_wipe_attendance') || customId.startsWith('cancel_wipe_attendance')) {
        console.log('Attendance button detected, routing to attendance command');
        
        // This is an attendance button
        const attendanceCommand = client.commands.get('attendance');
        if (attendanceCommand && attendanceCommand.handleButtonInteraction) {
            await attendanceCommand.handleButtonInteraction(interaction, attendanceCommand.dbManager);
        } else {
            console.error('Attendance command or handleButtonInteraction method not found');
        }
    } else if (customId.startsWith('leaderboard_') || customId === 'first' || customId === 'prev' || customId === 'next' || customId === 'last') {
        console.log('Leaderboard button detected, routing to leaderboard command');
        
        // This is a leaderboard button
        const leaderboardCommand = client.commands.get('leaderboard');
        if (leaderboardCommand && leaderboardCommand.handleButtonInteraction) {
            await leaderboardCommand.handleButtonInteraction(interaction, leaderboardCommand.dbManager);
        } else {
            console.error('Leaderboard command or handleButtonInteraction method not found');
        }
    } else if (customId === 'list_prev_page' || customId === 'list_next_page') {
        console.log('Build list pagination button detected, routing to build command');
        
        // This is a build list pagination button
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleListPaginationButton) {
            await buildCommand.handleListPaginationButton(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleListPaginationButton method not found');
        }
    } else if (customId === 'delete_prev_page' || customId === 'delete_next_page') {
        console.log('Build delete pagination button detected, routing to build command');
        
        // This is a build delete pagination button
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleDeletePaginationButton) {
            await buildCommand.handleDeletePaginationButton(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleDeletePaginationButton method not found');
        }
    } else if (customId === 'regear_confirm' || customId === 'regear_cancel' || customId === 'regear_next' || customId === 'regear_back' ||
               customId.startsWith('regear_confirm_pickup_') || customId.startsWith('regear_cancel_reservation_') || 
               customId.startsWith('regear_recipient_picked_up_')) {
        console.log('Regear button detected, routing to regear command');
        
        // This is a regear button (confirm/cancel/next/back or reservation buttons)
        const regearCommand = client.commands.get('regear');
        if (regearCommand && regearCommand.handleButtonInteraction) {
            const handled = await regearCommand.handleButtonInteraction(interaction, regearCommand.dbManager);
            if (!handled) {
                console.error('Regear button interaction was not handled');
            }
        } else {
            console.error('Regear command or handleButtonInteraction method not found');
        }
    } else if (customId.startsWith('alliance_split_approve_') || customId.startsWith('alliance_split_cancel_')) {
        console.log('Alliance split button detected');
        
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
        } else {
            // Check if user has alliance-split-approve permission directly
            try {
                const userHasPermission = await dbManager.hasPermission(interaction.guildId, member.id, 'alliance-split-approve');
                if (userHasPermission) {
                    hasPermission = true;
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have alliance-split-approve permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await dbManager.hasPermission(interaction.guildId, role.id, 'alliance-split-approve');
                        if (roleHasPermission) {
                            hasPermission = true;
                            break;
                        }
                    } catch (error) {
                        console.error(`Error checking role ${role.id} permission:`, error);
                    }
                }
            }
        }

        if (!hasPermission) {
            await interaction.reply({ 
                content: '❌ You do not have permission to approve or cancel loot splits.\n\n**Required:** Administrator role or alliance-split-approve permission', 
                ephemeral: true 
            });
            return;
        }

        const splitId = customId.split('_').slice(3).join('_'); // Extract split ID
        const pendingSplit = client.pendingAllianceSplits.get(splitId);

        if (!pendingSplit) {
            await interaction.reply({ 
                content: '❌ This loot split has already been processed or expired.', 
                ephemeral: true 
            });
            return;
        }

        if (customId.startsWith('alliance_split_approve_')) {
            // Approve - just remove from pending and update message
            client.pendingAllianceSplits.delete(splitId);
            
            const embedData = pendingSplit.embedData;
            const approvedEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Alliance Loot Split Approved')
                .setDescription(`This loot split has been approved and balances remain credited.`)
                .addFields(
                    { name: '📊 Summary', value: `**Content Type:** ${embedData.contentType}\n**Total Loot:** ${embedData.totalLoot.toLocaleString()} silver\n**Repair Fees:** ${embedData.repairFees.toLocaleString()} silver\n**Tax Rate:** ${embedData.taxRate}%\n**Caller Fee:** ${embedData.callerFee.toLocaleString()} silver`, inline: false },
                    { name: '👥 Phoenix Rebels Participants', value: embedData.participantsList, inline: false },
                    { name: '💵 Per Player', value: `${embedData.payoutPerPlayer.toLocaleString()} silver`, inline: true },
                    { name: '📢 Caller', value: embedData.callerMention, inline: true },
                    { name: '🆔 Split ID', value: `\`${splitId}\``, inline: false },
                    { name: '✅ Status', value: `Approved by ${interaction.user}`, inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.update({ embeds: [approvedEmbed], components: [] });
            await interaction.followUp({ 
                content: `✅ Loot split approved by ${interaction.user}. Balances remain credited.`, 
                ephemeral: false 
            });
        } else if (customId.startsWith('alliance_split_cancel_')) {
            // Cancel - reverse all balance changes
            try {
                for (const change of pendingSplit.balanceChanges) {
                    await dbManager.updateUserBalance(
                        pendingSplit.guildId, 
                        change.userId, 
                        change.amount, 
                        'subtract'
                    );
                }

                client.pendingAllianceSplits.delete(splitId);

                // Remove buttons and show simple cancellation message
                await interaction.update({ 
                    content: `❌ Loot split cancelled by ${interaction.user}. All balances have been reversed. (${pendingSplit.balanceChanges.length} users affected)`, 
                    embeds: [], 
                    components: [] 
                });
            } catch (error) {
                console.error('Error reversing alliance split:', error);
                await interaction.reply({ 
                    content: '❌ An error occurred while reversing the loot split. Please check logs.', 
                    ephemeral: true 
                });
            }
        }
    }
};

// Handle modal submissions
client.handleModalSubmit = async (interaction) => {
    console.log(`Modal submitted: ${interaction.customId} by user ${interaction.user.id}`);
    
    const customId = interaction.customId;
    
    if (customId.startsWith('modal_')) {
        console.log('Build modal detected, routing to build command');
        
        // This is a build creation modal
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleModalSubmit) {
            await buildCommand.handleModalSubmit(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleModalSubmit method not found');
        }
    } else if (customId === 'list_name_filter_modal') {
        console.log('List name filter modal detected, routing to build command');
        
        // This is a list name filter modal
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleListNameFilterModal) {
            await buildCommand.handleListNameFilterModal(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleListNameFilterModal method not found');
        }
    } else if (customId === 'delete_name_filter_modal') {
        console.log('Delete name filter modal detected, routing to build command');
        
        // This is a delete name filter modal
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleListNameFilterModal) {
            await buildCommand.handleListNameFilterModal(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleListNameFilterModal method not found');
        }
    } else if (customId.startsWith('comp_modal_')) {
        console.log('Comp modal detected, routing to comp command');
        
        // This is a comp modal
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleModalSubmit) {
            await compCommand.handleModalSubmit(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleModalSubmit method not found');
        }
    } else if (customId.startsWith('event_modal_')) {
        console.log('Event modal detected, routing to event command');
        
        // This is an event modal
        const eventCommand = client.commands.get('event');
        if (eventCommand && eventCommand.handleModalSubmit) {
            await eventCommand.handleModalSubmit(interaction, eventCommand.dbManager);
        } else {
            console.error('Event command or handleModalSubmit method not found');
        }
    } else if (customId.startsWith('build_edit_modal_')) {
        console.log('Build edit modal detected, routing to build-edit command');
        
        // This is a build edit modal
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleEditModalSubmit) {
            await buildEditCommand.handleEditModalSubmit(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleEditModalSubmit method not found');
        }
    }
};

// Handle select menu interactions
client.handleSelectMenuInteraction = async (interaction) => {
    console.log(`Select menu interaction: ${interaction.customId} by user ${interaction.user.id}`);
    
    const customId = interaction.customId;
    
    if (customId === 'content_type_select') {
        console.log('Content type select menu detected, routing to build command');
        
        // This is a build creation content type selection
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleButtonInteraction) {
            // We'll reuse the button interaction handler for select menus
            await buildCommand.handleButtonInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleButtonInteraction method not found');
        }
    } else if (customId === 'list_content_type_select') {
        console.log('List content type select menu detected, routing to build command');
        
        // This is a list content type selection
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleListInteraction) {
            await buildCommand.handleListInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleListInteraction method not found');
        }
    } else if (customId === 'delete_content_type_select') {
        console.log('Delete content type select menu detected, routing to build command');
        
        // This is a delete content type selection
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleDeleteInteraction) {
            await buildCommand.handleDeleteInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleDeleteInteraction method not found');
        }
    } else if (customId === 'list_build_name_select') {
        console.log('List build name select menu detected, routing to build command');
        
        // This is a list build name selection
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleListInteraction) {
            await buildCommand.handleListInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleListInteraction method not found');
        }
    } else if (customId === 'delete_build_name_select') {
        console.log('Delete build name select menu detected, routing to build command');
        
        // This is a delete build name selection
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleDeleteInteraction) {
            await buildCommand.handleDeleteInteraction(interaction, buildCommand.dbManager);
        } else {
            console.error('Build command or handleDeleteInteraction method not found');
        }
    } else if (customId === 'comp_content_type_select') {
        console.log('Comp content type select menu detected, routing to comp command');
        
        // This is a comp content type selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleButtonInteraction) {
            await compCommand.handleButtonInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleButtonInteraction method not found');
        }
    } else if (customId === 'comp_build_select') {
        console.log('Comp build select menu detected, routing to comp command');
        
        // This is a comp build selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleBuildSelection) {
            await compCommand.handleBuildSelection(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleBuildSelection method not found');
        }
    } else if (customId === 'comp_list_content_type_select') {
        console.log('Comp list content type select menu detected, routing to comp command');
        
        // This is a comp list content type selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleListInteraction) {
            await compCommand.handleListInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleListInteraction method not found');
        }
    } else if (customId === 'comp_list_name_select') {
        console.log('Comp list name select menu detected, routing to comp command');
        
        // This is a comp list name selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleListInteraction) {
            await compCommand.handleListInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleListInteraction method not found');
        }
    } else if (customId === 'comp_lock_content_type_select') {
        console.log('Comp lock content type select menu detected, routing to comp command');
        
        // This is a comp lock content type selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleLockInteraction) {
            await compCommand.handleLockInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleLockInteraction method not found');
        }
    } else if (customId === 'comp_lock_comp_select') {
        console.log('Comp lock comp select menu detected, routing to comp command');
        
        // This is a comp lock comp selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleLockCompSelection) {
            await compCommand.handleLockCompSelection(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleLockCompSelection method not found');
        }
    } else if (customId === 'comp_delete_content_type_select') {
        console.log('Comp delete content type select menu detected, routing to comp command');
        
        // This is a comp delete content type selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleDeleteInteraction) {
            await compCommand.handleDeleteInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleDeleteInteraction method not found');
        }
    } else if (customId === 'comp_delete_name_select') {
        console.log('Comp delete name select menu detected, routing to comp command');
        
        // This is a comp delete name selection
        const compCommand = client.commands.get('comp');
        if (compCommand && compCommand.handleDeleteInteraction) {
            await compCommand.handleDeleteInteraction(interaction, compCommand.dbManager);
        } else {
            console.error('Comp command or handleDeleteInteraction method not found');
        }
    } else if (customId === 'build_edit_content_type_select') {
        console.log('Build edit content type select menu detected, routing to build-edit command');
        
        // This is a build edit content type selection
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleContentTypeSelection) {
            await buildEditCommand.handleContentTypeSelection(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleContentTypeSelection method not found');
        }
    } else if (customId === 'build_edit_content_type_edit_select') {
        console.log('Build edit content type edit select menu detected, routing to build-edit command');
        
        // This is a build edit content type editing selection
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleContentTypeDropdownSelection) {
            await buildEditCommand.handleContentTypeDropdownSelection(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleContentTypeDropdownSelection method not found');
        }
    } else if (customId === 'build_edit_select') {
        console.log('Build edit select menu detected, routing to build-edit command');
        
        // This is a build edit selection
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleBuildEditInteraction) {
            await buildEditCommand.handleBuildEditInteraction(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleBuildEditInteraction method not found');
        }
    } else if (customId === 'build_edit_field_select') {
        console.log('Build edit field select menu detected, routing to build-edit command');
        
        // This is a build edit field selection
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleFieldEditSelection) {
            await buildEditCommand.handleFieldEditSelection(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleFieldEditSelection method not found');
        }
    } else if (customId === 'build_edit_content_type_select') {
        console.log('Build edit content type select menu detected, routing to build-edit command');
        
        // This is a build edit content type selection
        const buildEditCommand = client.commands.get('build-edit');
        if (buildEditCommand && buildEditCommand.handleContentTypeDropdownSelection) {
            await buildEditCommand.handleContentTypeDropdownSelection(interaction, buildEditCommand.dbManager);
        } else {
            console.error('Build-edit command or handleContentTypeDropdownSelection method not found');
        }
    } else if (customId === 'event_content_type_select') {
        console.log('Event content type select menu detected, routing to event command');
        
        // This is an event content type selection
        const eventCommand = client.commands.get('event');
        if (eventCommand && eventCommand.handleContentTypeSelection) {
            await eventCommand.handleContentTypeSelection(interaction, eventCommand.dbManager);
        } else {
            console.error('Event command or handleContentTypeSelection method not found');
        }
    } else if (customId === 'event_comp_select') {
        console.log('Event comp select menu detected, routing to event command');
        
        // This is an event composition selection
        const eventCommand = client.commands.get('event');
        if (eventCommand && eventCommand.handleCompSelection) {
            await eventCommand.handleCompSelection(interaction, eventCommand.dbManager);
        } else {
            console.error('Event command or handleCompSelection method not found');
        }
    } else if (customId === 'event_cancel_select') {
        console.log('Event cancel select menu detected, routing to event command');
        
        // This is an event cancellation selection
        const eventCommand = client.commands.get('event');
        if (eventCommand && eventCommand.handleCancelSelection) {
            await eventCommand.handleCancelSelection(interaction, eventCommand.dbManager);
        } else {
            console.error('Event command or handleCancelSelection method not found');
        }
    } else if (customId === 'signup_content_type_select') {
        console.log('Signup content type select menu detected, routing to signup command');
        
        // This is a signup content type selection
        const signupCommand = client.commands.get('signup');
        if (signupCommand && signupCommand.handleContentTypeSelection) {
            await signupCommand.handleContentTypeSelection(interaction, signupCommand.dbManager);
        } else {
            console.error('Signup command or handleContentTypeSelection method not found');
        }
    } else if (customId === 'signup_comp_select') {
        console.log('Signup comp select menu detected, routing to signup command');
        
        // This is a signup composition selection
        const signupCommand = client.commands.get('signup');
        if (signupCommand && signupCommand.handleCompSelection) {
            await signupCommand.handleCompSelection(interaction, signupCommand.dbManager);
        } else {
            console.error('Signup command or handleCompSelection method not found');
        }
    } else if (customId.startsWith('regear_')) {
        console.log('Regear select menu detected, routing to regear command');
        
        // This is a regear selection
        const regearCommand = client.commands.get('regear');
        if (regearCommand && regearCommand.handleSelectMenuInteraction) {
            try {
                const handled = await regearCommand.handleSelectMenuInteraction(interaction, regearCommand.dbManager);
                if (!handled) {
                    console.error('Regear select menu interaction was not handled');
                }
            } catch (error) {
                // Check if interaction expired
                if (error.code === 10062) {
                    console.warn('Regear select menu interaction expired');
                } else {
                    // Re-throw to be handled by global error handler
                    throw error;
                }
            }
        } else {
            console.error('Regear command or handleSelectMenuInteraction method not found');
        }
    }
};

// Guild join event
client.on(Events.GuildCreate, guild => {
    console.log(`🎉 Bot joined guild: ${guild.name} (${guild.id})`);
});

// Guild leave event
client.on(Events.GuildDelete, guild => {
    console.log(`👋 Bot left guild: ${guild.name} (${guild.id})`);
});

// Error handling
process.on('unhandledRejection', (error, promise) => {
    console.error('❌ Unhandled promise rejection:', error);
    console.error('Stack trace:', error.stack);
    // Don't exit in production to allow the bot to recover, but log the error
    if (process.env.NODE_ENV === 'production') {
        console.error('⚠️ Continuing despite unhandled rejection (production mode)');
    } else {
        process.exit(1);
    }
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught exception:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});

// Discord client error handling
client.on('error', error => {
    console.error('❌ Discord client error:', error);
    if (error.message && error.message.includes('intents')) {
        console.error('⚠️ INTENT ERROR: Make sure all required intents are enabled in Discord Developer Portal!');
        console.error('   Go to: https://discord.com/developers/applications -> Your Bot -> Bot -> Privileged Gateway Intents');
        console.error('   Required intents: GUILDS, GUILD_MESSAGES, GUILD_VOICE_STATES');
    }
});

client.on('warn', warning => {
    console.warn('⚠️ Discord client warning:', warning);
    if (warning && warning.includes('intent')) {
        console.warn('⚠️ INTENT WARNING: Check your Discord Developer Portal intents configuration');
    }
});

// Handle authentication errors
client.on('disconnect', (event) => {
    console.error('❌ Bot disconnected from Discord');
    if (event.code === 4014) {
        console.error('⚠️ DISCONNECT CODE 4014: Missing required intents!');
        console.error('   Enable all required intents in Discord Developer Portal');
    }
});

client.on('reconnecting', () => {
    console.log('🔄 Bot reconnecting to Discord...');
});

// Handle shard errors (intent-related)
client.on('shardError', error => {
    console.error('❌ Shard error:', error);
    if (error.message && error.message.includes('intents')) {
        console.error('⚠️ SHARD ERROR: Intent configuration issue!');
        console.error('   Check Discord Developer Portal -> Bot -> Privileged Gateway Intents');
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await dbManager.disconnect();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down bot...');
    await dbManager.disconnect();
    client.destroy();
    process.exit(0);
});

// Helper: parse JSON body with a small size limit
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        const MAX_SIZE = 1 * 1024 * 1024; // 1MB safety cap

        req.on('data', chunk => {
            body += chunk;
            if (body.length > MAX_SIZE) {
                reject(new Error('Payload too large'));
                req.destroy();
            }
        });

        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                resolve(parsed);
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });

        req.on('error', reject);
    });
}

// Process alliance webhook payloads to credit balances with Phoenix tax + caller fee
async function handleAllianceLootsplitWebhook(req, res) {
    try {
        const secret = req.headers['x-webhook-secret'];
        if (!config.integrations.allianceWebhookSecret || secret !== config.integrations.allianceWebhookSecret) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        const payload = await parseJsonBody(req);
        const {
            guildId,
            contentType,
            totalLoot,
            repairFees = 0,
            callerFeeRate,
            callerId,
            participants
        } = payload || {};

        if (!guildId || !contentType || !totalLoot || !callerId || !Array.isArray(participants)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields' }));
            return;
        }

        // Ensure guild exists in Phoenix
        const guildRegistered = await dbManager.isGuildRegistered(guildId);
        if (!guildRegistered) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Guild not registered in Phoenix Assistance' }));
            return;
        }

        // Validate users and filter to registered only in THIS Phoenix guild
        // Users registered in Phoenix but under a different guildId will be excluded
        const registrationChecks = await Promise.all(
            participants.map(async userId => ({
                userId,
                registered: await dbManager.isUserRegistered(guildId, userId)
            }))
        );
        const validUsers = registrationChecks.filter(r => r.registered).map(r => r.userId);

        // Caller doesn't need to be in Phoenix - if they're not, they just won't get the caller fee
        const callerInPhoenix = validUsers.includes(callerId);

        if (validUsers.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No registered participants found' }));
            return;
        }

        // Compute tax and caller fee using Phoenix rules
        let taxRate = await dbManager.getTaxRate(guildId, contentType);
        if (taxRate === null || taxRate === undefined) {
            taxRate = 20; // default Phoenix tax
        }
        const callerCutRate = callerFeeRate !== undefined && callerFeeRate !== null
            ? callerFeeRate
            : config.integrations.defaultCallerFeeRate || 0.05;

        // Only allocate the portion belonging to Phoenix-registered participants
        const totalParticipants = participants.length;
        const phoenixCount = validUsers.length;
        const ratio = totalParticipants > 0 ? Math.min(1, phoenixCount / totalParticipants) : 0;

        // Base values
        const lootAfterRepairsTotal = Math.max(0, totalLoot - repairFees);
        const phoenixAfterRepairs = Math.floor(lootAfterRepairsTotal * ratio);

        // Tax rule: tax is computed on totalLoot, then repair fees are deducted; apply full tax to the Phoenix pool
        const rawTax = totalLoot * taxRate / 100;
        const taxAmount = Math.max(0, Math.floor(rawTax - repairFees));

        // Caller fee is on post-repair total and is NOT taxed; only paid if caller is Phoenix
        const callerFee = Math.floor(lootAfterRepairsTotal * callerCutRate);

        // Split pool for Phoenix members
        const splitPool = Math.max(0, phoenixAfterRepairs - taxAmount - (callerInPhoenix ? callerFee : 0));

        if (splitPool < 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Split pool is negative after fees' }));
            return;
        }

        const payoutPerPlayer = Math.floor(splitPool / phoenixCount);

        // Store balance changes for potential reversal
        const balanceChanges = [];
        for (const userId of validUsers) {
            const amount = userId === callerId
                ? payoutPerPlayer + (callerInPhoenix ? callerFee : 0)
                : payoutPerPlayer;
            balanceChanges.push({ userId, amount });
            await dbManager.updateUserBalance(guildId, userId, amount, 'add');
        }

        // Create split ID for tracking
        const splitId = `alliance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Prepare embed display data
        const callerMention = callerId ? `<@${callerId}>` : 'Unknown';
        const participantsList = validUsers.map(id => `<@${id}>`).join(', ') || 'None';
        const displayParticipantsList = participantsList.length > 1024 ? `${participantsList.substring(0, 1020)}...` : participantsList;

        // Store split data for potential cancellation
        client.pendingAllianceSplits.set(splitId, {
            guildId,
            balanceChanges,
            splitData: {
                splitType: contentType,
                totalLoot,
                repairFees,
                taxRate,
                taxAmount,
                callerFeeRate: callerCutRate,
                callerFee,
                payoutPerPlayer,
                participants: validUsers,
                callerId,
                source: 'alliance-webhook'
            },
            embedData: {
                callerMention,
                participantsList: displayParticipantsList,
                contentType,
                totalLoot,
                repairFees,
                taxRate,
                callerFee,
                payoutPerPlayer
            },
            createdAt: new Date()
        });

        // Record the split for history
        await dbManager.createLootSplit(guildId, {
            splitType: contentType,
            totalLoot,
            repairFees,
            taxRate,
            taxAmount,
            callerFeeRate: callerCutRate,
            callerFee,
            payoutPerPlayer,
            participants: validUsers,
            callerId,
            source: 'alliance-webhook',
            splitId // Store for reference
        });

        // Send confirmation message to notification channel if configured
        if (config.integrations.allianceNotificationChannelId && client.isReady()) {
            try {
                const channel = await client.channels.fetch(config.integrations.allianceNotificationChannelId);
                if (channel && channel.isTextBased()) {
                    const confirmEmbed = new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle('💰 Alliance Loot Split Received')
                        .setDescription(`A loot split from the Alliance bot has been processed and balances have been credited.`)
                        .addFields(
                            { name: '📊 Summary', value: `**Content Type:** ${contentType}\n**Total Loot:** ${totalLoot.toLocaleString()} silver\n**Repair Fees:** ${repairFees.toLocaleString()} silver\n**Tax Rate:** ${taxRate}%\n**Caller Fee:** ${callerFee.toLocaleString()} silver`, inline: false },
                            { name: '👥 Phoenix Rebels Participants', value: displayParticipantsList, inline: false },
                            { name: '💵 Per Player', value: `${payoutPerPlayer.toLocaleString()} silver`, inline: true },
                            { name: '📢 Caller', value: callerMention, inline: true },
                            { name: '🆔 Split ID', value: `\`${splitId}\``, inline: false }
                        )
                        .setFooter({ text: 'Click Cancel to reverse balances if this split was incorrect' })
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`alliance_split_approve_${splitId}`)
                                .setLabel('✅ Approve')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`alliance_split_cancel_${splitId}`)
                                .setLabel('❌ Cancel & Reverse')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌')
                        );

                    await channel.send({ embeds: [confirmEmbed], components: [row] });
                }
            } catch (error) {
                console.error('Failed to send alliance split confirmation:', error);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            creditedUsers: validUsers.length,
            taxRate,
            taxAmount,
            callerFee,
            payoutPerPlayer,
            splitId
        }));
    } catch (err) {
        console.error('Error handling alliance lootsplit webhook:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

// Memory log buffer for debugging
const logBuffer = [];
function addToLog(type, message) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
    const logLine = `[${timestamp}] [${type}] ${message}`;
    logBuffer.push(logLine);
    if (logBuffer.length > 100) logBuffer.shift(); // Keep last 100 lines
    
    // Also log to original stdout/stderr to avoid recursion
    if (type === 'ERROR') originalError.call(console, message);
    else originalLog.call(console, message);
}

// Override console methods to capture logs
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => addToLog('INFO', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
console.error = (...args) => addToLog('ERROR', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));

// Create HTTP server for ping services, health checks, and ingestion webhook
const server = http.createServer((req, res) => {
    // Health check endpoint to prevent Render spin-down
    if (req.url === '/health' || req.url === '/') {
        const botStatus = client.user ? 'online' : 'offline';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'ok', 
            bot: botStatus,
            nodeVersion: process.version,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            commands: client.commands ? client.commands.size : 0
        }));
    } else if (req.url === '/logs') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(logBuffer.join('\n'));
    } else if (req.url === '/ingest-lootsplit' && req.method === 'POST') {
        handleAllianceLootsplitWebhook(req, res);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot is alive! 🟢');
    }
});

// Start HTTP server on port 8080 (Render will use this)
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 HTTP server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});

server.on('error', (error) => {
    console.error('❌ HTTP server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} is already in use`);
    }
});

// Keep-alive ping every 5 minutes to prevent Render spin-down (free tier)
if (process.env.NODE_ENV === 'production') {
    setInterval(() => {
        http.get(`http://localhost:${PORT}/health`, (res) => {
            // Just ping to keep service alive
        }).on('error', () => {
            // Ignore errors
        });
    }, 5 * 60 * 1000); // Every 5 minutes
}

// Login to Discord
console.log('🚀 Starting bot...');
console.log(`Node.js version: ${process.version}`);
console.log('📝 Checking configuration...');
console.log('🔐 Configured intents:');
console.log('   - GUILDS (Guilds)');
console.log('   - GUILD_MESSAGES (Guild Messages)');
console.log('   - GUILD_VOICE_STATES (Guild Voice States)');
console.log('⚠️  Make sure these are enabled in Discord Developer Portal!');
console.log('   https://discord.com/developers/applications -> Your Bot -> Bot -> Privileged Gateway Intents');

if (!config.bot.token || config.bot.token === '') {
    console.error('❌ BOT_TOKEN is missing or empty! Please set BOT_TOKEN in your environment variables.');
    console.error('   The bot cannot start without a valid Discord bot token.');
    process.exit(1);
}

if (!config.database.uri || config.database.uri === '') {
    console.warn('⚠️ MONGODB_URI is missing or empty! Database features will not work.');
} else {
    console.log('✅ MONGODB_URI is configured');
}

console.log('🔑 BOT_TOKEN is configured');

// Manual REST API Check using standalone REST instance (proven to work in deploy-commands.js)
const { REST } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(config.bot.token);

console.log('🧪 Testing REST API connection to Discord (Standalone REST)...');
rest.get(Routes.gatewayBot())
    .then(data => {
        console.log('✅ REST API Connection Successful!');
        console.log(`   Gateway URL: ${data.url}`);
        console.log(`   Recommended Shards: ${data.shards}`);
        
        // Now try to login
        console.log('🔌 Attempting to login to Discord...');
        client.login(config.bot.token).catch(error => {
             console.error('❌ Failed to login to Discord:', error);
        });
    })
    .catch(err => {
        console.error('❌ REST API Connection FAILED!');
        console.error('   Error Details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    });

// Debug logging
client.on('debug', info => console.log(`[DEBUG] ${info}`));
client.on('warn', info => console.log(`[WARN] ${info}`));
client.on('error', error => console.error(`[ERROR] ${error.message}`));

// Remove duplicate login call at the end of the file
// client.login(config.bot.token).catch(...) is now handled in the REST success callback
