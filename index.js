const { Client, Collection, GatewayIntentBits, Events, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const DatabaseManager = require('./database.js');

// Load configuration
const config = require('./config.js');

// Create Discord client with only allowed intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Create collections for commands
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize database manager
const dbManager = new DatabaseManager();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        // Pass the database manager to the command
        command.dbManager = dbManager;
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required properties`);
    }
}

// Bot ready event
client.once(Events.ClientReady, async () => {
    console.log(`🤖 Bot is ready! Logged in as ${client.user.tag}`);
    
    // Connect to database
    const dbConnected = await dbManager.connect();
    if (dbConnected) {
        console.log('📊 Database connection established');
        
        // Load all event signups for all guilds to ensure we have current state after bot reset
        await loadAllEventSignupsForAllGuilds();
        
        // Load all voice channel setups for all guilds
        await loadAllVoiceChannelSetups();
    } else {
        console.log('❌ Failed to connect to database');
    }
    
    // Set bot status
    client.user.setActivity('𓆩𖤍𓆪 Phoenix Rebels 𓆩𖤍𓆪', { type: 'WATCHING' });
    
    // Test event handler registration
    console.log('🔧 Testing event handler registration...');
    console.log(`MessageDelete event handlers: ${client.listenerCount(Events.MessageDelete)}`);
});

// Helper function to load all event signups for all guilds
async function loadAllEventSignupsForAllGuilds() {
    try {
        console.log('🔄 Loading all event signups for all guilds...');
        
        // Initialize event signups storage if it doesn't exist
        if (!client.eventSignups) {
            client.eventSignups = new Map();
        }
        
        // Get all guilds the bot is in
        const guilds = client.guilds.cache;
        console.log(`Found ${guilds.size} guilds`);
        
        // Load event signups for each guild
        for (const [guildId, guild] of guilds) {
            try {
                // Get all events for this guild
                const events = await dbManager.getEvents(guildId);
                console.log(`Loading signups for ${events.length} events in guild: ${guild.name}`);
                
                // Load signups for each event
                for (const event of events) {
                    const existingSignups = await dbManager.getEventSignups(guildId, event.name);
                    existingSignups.forEach((signups, key) => {
                        client.eventSignups.set(key, signups);
                    });
                    console.log(`Loaded ${existingSignups.size} signup entries for event: ${event.name} in guild: ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error loading event signups for guild ${guild.name}:`, error);
            }
        }
        
        console.log(`✅ Total signup entries loaded across all guilds: ${client.eventSignups.size}`);
    } catch (error) {
        console.error('Error loading all event signups for all guilds:', error);
    }
}

// Helper function to load all voice channel setups for all guilds
async function loadAllVoiceChannelSetups() {
    try {
        console.log('🔄 Loading all voice channel setups for all guilds...');
        
        // Initialize voice channel setups storage if it doesn't exist
        if (!client.voiceChannelSetups) {
            client.voiceChannelSetups = new Map();
        }
        
        // Get all guilds the bot is in
        const guilds = client.guilds.cache;
        console.log(`Found ${guilds.size} guilds`);
        
        // Load voice channel setups for each guild
        for (const [guildId, guild] of guilds) {
            try {
                const setup = await dbManager.getVoiceChannelSetup(guildId);
                if (setup) {
                    client.voiceChannelSetups.set(guildId, setup);
                    console.log(`Loaded voice channel setup for guild: ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error loading voice channel setup for guild ${guild.name}:`, error);
            }
        }
        
        console.log(`✅ Total voice channel setups loaded: ${client.voiceChannelSetups.size}`);
    } catch (error) {
        console.error('Error loading all voice channel setups for all guilds:', error);
    }
}

// Message delete event - handle cleanup of signup and event data when messages are deleted
client.on(Events.MessageDelete, async (message) => {
    console.log(`🔍 MESSAGE DELETE EVENT TRIGGERED - Message ID: ${message.id}`);
    
    try {
        console.log(`🔍 Message deletion detected:`, {
            messageId: message.id,
            guildId: message.guildId,
            channelId: message.channelId,
            authorId: message.author?.id,
            isBotMessage: message.author?.id === client.user.id,
            hasEmbeds: message.embeds && message.embeds.length > 0,
            embedTitle: message.embeds?.[0]?.title || 'No title'
        });
        
        // Check if this is a message from our bot
        if (message.author && message.author.id === client.user.id && 
            message.embeds && message.embeds.length > 0) {
            
            const embed = message.embeds[0];
            const title = embed.title || '';
            
            console.log(`📝 Processing bot message deletion with title: "${title}"`);
            
            // Handle signup message deletion
            if (title.startsWith('📝 Build Signup')) {
                console.log('Signup message deleted, cleaning up database signups');
                
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
                        console.log(`Cleaning up signups for composition: ${compName}, session: ${sessionId}`);
                        
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
                        
                        console.log(`✅ Cleaned up signups for composition: ${compName}, session: ${sessionId}`);
                    } else {
                        console.log(`Could not determine session ID for composition: ${compName}, cleaning up all signups`);
                        
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
                        
                        console.log(`✅ Cleaned up all signups for composition: ${compName}`);
                    }
                }
            }
            
            // Handle event message deletion
            else if (title.includes('📅') || title.includes('**') || title.toLowerCase().includes('event')) {
                console.log('🎯 EVENT MESSAGE DELETION DETECTED!');
                console.log('Event message deleted, cleaning up database event and signups');
                console.log(`Message details: Guild ID: ${message.guildId}, Title: "${title}"`);
                
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
                        console.log(`Extracted event name using pattern ${pattern.source}: "${eventName}"`);
                        break;
                    }
                }
                
                if (eventName) {
                    console.log(`Final extracted event name: "${eventName}"`);
                    console.log(`Cleaning up event and signups for event: ${eventName} in guild: ${message.guildId}`);
                    
                    try {
                        // First, verify the event exists in the database
                        const events = await dbManager.getEvents(message.guildId);
                        const eventExists = events.find(e => e.name === eventName);
                        console.log(`Event "${eventName}" exists in database: ${!!eventExists}`);
                        
                        if (eventExists) {
                            console.log(`Event details:`, eventExists);
                            
                            // Clean up event signups from database
                            console.log(`Cleaning up event signups...`);
                            const signupCleanupResult = await dbManager.cleanupEventSignups(message.guildId, eventName);
                            console.log(`Signup cleanup result: ${signupCleanupResult}`);
                            
                            // Delete the event itself from database
                            console.log(`Deleting event from database...`);
                            const deleteResult = await dbManager.deleteEvent(message.guildId, eventName);
                            console.log(`Event deletion result: ${deleteResult}`);
                            
                            // Verify deletion
                            const eventsAfterDelete = await dbManager.getEvents(message.guildId);
                            const eventStillExists = eventsAfterDelete.find(e => e.name === eventName);
                            console.log(`Event still exists after deletion: ${!!eventStillExists}`);
                            
                            // Also clean up from memory if it exists
                            if (client.eventSignups) {
                                let memoryCleanupCount = 0;
                                for (const [key] of client.eventSignups) {
                                    if (key.startsWith(`event_${eventName}_`)) {
                                        client.eventSignups.delete(key);
                                        memoryCleanupCount++;
                                    }
                                }
                                console.log(`Cleaned up ${memoryCleanupCount} memory entries`);
                            }
                            
                            console.log(`✅ Cleaned up event and signups for event: ${eventName}`);
                        } else {
                            console.log(`⚠️ Event "${eventName}" not found in database, trying fuzzy search...`);
                            
                            // Try fuzzy search through all events to find a match
                            const allEvents = await dbManager.getEvents(message.guildId);
                            const fuzzyMatch = allEvents.find(e => 
                                e.name.toLowerCase().includes(eventName.toLowerCase()) ||
                                eventName.toLowerCase().includes(e.name.toLowerCase())
                            );
                            
                            if (fuzzyMatch) {
                                console.log(`Found fuzzy match: "${fuzzyMatch.name}" for search term "${eventName}"`);
                                eventName = fuzzyMatch.name; // Use the actual event name from database
                                
                                // Retry cleanup with the correct event name
                                console.log(`🔄 Retrying cleanup with correct event name: "${eventName}"`);
                                
                                try {
                                    const signupCleanupResult = await dbManager.cleanupEventSignups(message.guildId, eventName);
                                    const deleteResult = await dbManager.deleteEvent(message.guildId, eventName);
                                    
                                    console.log(`Fuzzy match cleanup - Signup cleanup: ${signupCleanupResult}, Event deletion: ${deleteResult}`);
                                    
                                    if (deleteResult) {
                                        console.log(`✅ Fuzzy match cleanup successful for event: ${eventName}`);
                                    } else {
                                        console.log(`❌ Fuzzy match cleanup failed for event: ${eventName}`);
                                    }
                                } catch (fuzzyError) {
                                    console.error(`❌ Fuzzy match cleanup error:`, fuzzyError);
                                }
                            } else {
                                console.log(`⚠️ No fuzzy match found for event name: "${eventName}"`);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Error cleaning up event ${eventName}:`, error);
                        console.error('Full error details:', error);
                        
                        // Even if there's an error, try to force delete the event
                        console.log(`🔄 Attempting force deletion of event: ${eventName}`);
                        try {
                            const forceDeleteResult = await dbManager.deleteEvent(message.guildId, eventName);
                            console.log(`Force delete result: ${forceDeleteResult}`);
                            
                            if (forceDeleteResult) {
                                console.log(`✅ Force deletion successful for event: ${eventName}`);
                            } else {
                                console.log(`❌ Force deletion failed for event: ${eventName}`);
                            }
                        } catch (forceError) {
                            console.error(`❌ Force deletion error:`, forceError);
                        }
                    }
                } else {
                    console.log(`⚠️ Could not extract event name from title: "${title}"`);
                    
                    // Last resort: try to find any event that might match the title
                    console.log(`🔄 Attempting last resort event search...`);
                    try {
                        const allEvents = await dbManager.getEvents(message.guildId);
                        console.log(`Available events in guild:`, allEvents.map(e => e.name));
                        
                        // Look for any event that might be in the title
                        for (const event of allEvents) {
                            if (title.toLowerCase().includes(event.name.toLowerCase())) {
                                console.log(`Found potential match: "${event.name}" in title: "${title}"`);
                                
                                // Try to delete this event
                                const deleteResult = await dbManager.deleteEvent(message.guildId, event.name);
                                console.log(`Last resort deletion result for "${event.name}": ${deleteResult}`);
                                
                                if (deleteResult) {
                                    console.log(`✅ Last resort deletion successful for event: ${event.name}`);
                                    break;
                                }
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
        console.error('Error handling voice state update:', error);
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
        console.error(`Error handling interaction:`, error);
        
        const errorMessage = {
            content: 'There was an error while processing this interaction!',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
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
            await buildEditCommand.handlePaginationButton(interaction);
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
            await buildCommand.handleListPaginationButton(interaction);
        } else {
            console.error('Build command or handleListPaginationButton method not found');
        }
    } else if (customId === 'delete_prev_page' || customId === 'delete_next_page') {
        console.log('Build delete pagination button detected, routing to build command');
        
        // This is a build delete pagination button
        const buildCommand = client.commands.get('build');
        if (buildCommand && buildCommand.handleDeletePaginationButton) {
            await buildCommand.handleDeletePaginationButton(interaction);
        } else {
            console.error('Build command or handleDeletePaginationButton method not found');
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
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
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

// Create HTTP server for ping services
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive! 🟢');
});

// Start HTTP server on port 8080 (Render will use this)
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 HTTP server running on port ${PORT}`);
});

// Login to Discord
client.login(config.bot.token);
