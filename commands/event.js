const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Manage events for your guild')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new event')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the event')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('date')
                        .setDescription('Date for the event (e.g., "tomorrow", "8/25", "Jan 15")')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('Time for the event (e.g., "8 PM", "20:00", "04 UTC")')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all events')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel an event')
        ),

    async execute(interaction, db) {
        if (!db) {
            console.error('Database manager not found');
            await interaction.reply({
                content: '❌ Database connection error. Please try again later.',
                ephemeral: true
            });
            return;
        }

        // Load all existing event signups from database to ensure we have current state
        // This is especially important after bot resets
        await this.loadAllEventSignups(interaction, db);

        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'create':
                await this.handleInteractiveCreate(interaction, db);
                break;
            case 'list':
                await this.handleList(interaction, db);
                break;
            case 'cancel':
                await this.handleCancel(interaction, db);
                break;
            default:
                await interaction.reply({
                    content: '❌ Unknown subcommand.',
                    ephemeral: true
                });
        }
    },

    // Utility function to parse date/time input and convert to timestamp
    parseDateTime(input) {
        try {
            let date = new Date();
            const now = new Date();
            
            // Convert input to lowercase for easier parsing
            const inputLower = input.toLowerCase().trim();
            
            // Handle relative time formats
            if (inputLower.includes('tomorrow')) {
                date.setDate(date.getDate() + 1);
                date.setHours(0, 0, 0, 0); // Start of day
                
                // Extract time from input (e.g., "tomorrow at 8 pm", "tomorrow 8pm")
                const timeMatch = inputLower.match(/(\d{1,2})\s*(am|pm)/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[2].toLowerCase();
                    
                    if (ampm === 'pm' && hour !== 12) hour += 12;
                    if (ampm === 'am' && hour === 12) hour = 0;
                    
                    date.setHours(hour, 0, 0, 0);
                }
            } else if (inputLower.includes('today')) {
                date.setHours(0, 0, 0, 0); // Start of day
                
                // Extract time from input (e.g., "today at 8 pm", "today 8pm", "today 4")
                const timeMatch = inputLower.match(/(\d{1,2})\s*(am|pm)?/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[2] ? timeMatch[2].toLowerCase() : null;
                    
                    if (ampm === 'pm' && hour !== 12) hour += 12;
                    if (ampm === 'am' && hour === 12) hour = 0;
                    // If no AM/PM specified, assume 24-hour format or treat as-is
                    
                    date.setHours(hour, 0, 0, 0);
                }
            } else if (inputLower.includes('next week')) {
                date.setDate(date.getDate() + 7);
                date.setHours(0, 0, 0, 0); // Start of day
                
                // Extract time from input
                const timeMatch = inputLower.match(/(\d{1,2})\s*(am|pm)/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[2].toLowerCase();
                    
                    if (ampm === 'pm' && hour !== 12) hour += 12;
                    if (ampm === 'am' && hour === 12) hour = 0;
                    
                    date.setHours(hour, 0, 0, 0);
                }
            } else if (inputLower.includes('next month')) {
                date.setMonth(date.getMonth() + 1);
                date.setHours(0, 0, 0, 0); // Start of day
                
                // Extract time from input
                const timeMatch = inputLower.match(/(\d{1,2})\s*(am|pm)/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[2].toLowerCase();
                    
                    if (ampm === 'pm' && hour !== 12) hour += 12;
                    if (ampm === 'am' && hour === 12) hour = 0;
                    
                    date.setHours(hour, 0, 0, 0);
                }
            } else if (inputLower.includes('in') || /^\d+\s*(minute|hour|day|week)/.test(inputLower)) {
                // Handle "in X hours/days/weeks" format or just "X minutes/hours/days/weeks"
                const hourMatch = inputLower.match(/(?:in\s+)?(\d+)\s*hour/);
                const dayMatch = inputLower.match(/(?:in\s+)?(\d+)\s*day/);
                const weekMatch = inputLower.match(/(?:in\s+)?(\d+)\s*week/);
                const minuteMatch = inputLower.match(/(?:in\s+)?(\d+)\s*minute/);
                
                if (hourMatch) {
                    date.setHours(date.getHours() + parseInt(hourMatch[1]));
                } else if (dayMatch) {
                    date.setDate(date.getDate() + parseInt(dayMatch[1]));
                } else if (weekMatch) {
                    date.setDate(date.getDate() + (parseInt(weekMatch[1]) * 7));
                } else if (minuteMatch) {
                    date.setMinutes(date.getMinutes() + parseInt(minuteMatch[1]));
                }
            } else if (inputLower.includes('this evening') || inputLower.includes('tonight')) {
                // Set to 8 PM today
                date.setHours(20, 0, 0, 0);
            } else if (inputLower.includes('this afternoon')) {
                // Set to 2 PM today
                date.setHours(14, 0, 0, 0);
            } else if (inputLower.includes('this morning')) {
                // Set to 9 AM today
                date.setHours(9, 0, 0, 0);
            } else {
                // Try to parse common formats
                const formats = [
                    // "8 PM", "8pm"
                    /^(\d{1,2})\s*(am|pm)$/i,
                    // "20:00"
                    /^(\d{1,2}):(\d{2})$/,
                    // "8/25 23:59"
                    /^(\d{1,2})\s*\/\s*(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
                    // "8/25 04 UTC"
                    /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2})\s*utc$/i,
                    // "04 UTC", "4 UTC"
                    /^(\d{1,2})\s*utc$/i,
                    // "4 PM UTC", "4:15 UTC", "16:30 UTC"
                    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*utc$/i,
                    // "Jan 15 8 PM"
                    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{1,2})\s*(am|pm)/i,
                    // "15 Jan 8 PM"
                    /^(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\s*(am|pm)/i
                ];
                
                let matched = false;
                for (const format of formats) {
                    const match = input.match(format);
                    if (match) {
                        if (format.source.includes('am|pm')) {
                            // Handle time-only or date+time formats
                            if (match.length === 3) {
                                // Time only: "8 PM"
                                let hour = parseInt(match[1]);
                                const ampm = match[2].toLowerCase();
                                
                                if (ampm === 'pm' && hour !== 12) hour += 12;
                                if (ampm === 'am' && hour === 12) hour = 0;
                                
                                date.setHours(hour, 0, 0, 0);
                            } else if (match.length === 5) {
                                // Date + time: "Jan 15 8 PM"
                                const month = match[1];
                                const day = parseInt(match[2]);
                                let hour = parseInt(match[3]);
                                const ampm = match[4].toLowerCase();
                                
                                const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                                                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month);
                                
                                if (monthIndex !== -1) {
                                    date.setMonth(monthIndex);
                                    date.setDate(day);
                                    
                                    if (ampm === 'pm' && hour !== 12) hour += 12;
                                    if (ampm === 'am' && hour === 12) hour = 0;
                                    
                                    date.setHours(hour, 0, 0, 0);
                                }
                            }
                        } else if (format.source.includes(':')) {
                            // Handle "20:00" format or "8/25 23:59" format
                            if (format.source.includes('\\/')) {
                                // "8/25 23:59" format - match[1] = month, match[2] = day, match[3] = hour, match[4] = minute
                                const month = parseInt(match[1]) - 1; // Month is 0-indexed
                                const day = parseInt(match[2]);
                                const hour = parseInt(match[3]);
                                const minute = parseInt(match[4]);
                                
                                // Create a new date object to prevent corruption
                                const currentYear = new Date().getFullYear();
                                date = new Date(currentYear, month, day, hour, minute, 0, 0);
                            } else {
                                // "20:00" format (time only)
                                const hour = parseInt(match[1]);
                                const minute = parseInt(match[2]);
                                date.setHours(hour, minute, 0, 0);
                            }
                        } else if (format.source.includes('utc')) {
                            // Handle UTC time formats: "04 UTC", "4 PM UTC", "4:15 UTC", "16:30 UTC"
                            let hour = parseInt(match[1]);
                            let minute = 0;
                            
                            // Check if this is the MM/DD HH UTC format
                            if (format.source.includes('\\/')) {
                                // "8/25 04 UTC" format - match[1] = month, match[2] = day, match[3] = hour
                                const month = parseInt(match[1]) - 1; // Month is 0-indexed
                                const day = parseInt(match[2]);
                                hour = parseInt(match[3]);
                                
                                // Create a new date object with current year
                                const currentYear = new Date().getFullYear();
                                let targetYear = currentYear;
                                
                                // Check if this date has already passed this year
                                const testDate = new Date(currentYear, month, day);
                                const now = new Date();
                                if (testDate < now) {
                                    targetYear = currentYear + 1; // Move to next year
                                }
                                
                                date = new Date(targetYear, month, day, 0, 0, 0, 0);
                                
                                // Set the time as UTC
                                date.setUTCHours(hour, minute, 0, 0);
                            } else {
                                // Regular UTC time format: "04 UTC", "4 PM UTC", "4:15 UTC"
                                // Check if minutes are provided (e.g., "4:15 UTC")
                                if (match[2] && match[2] !== undefined) {
                                    minute = parseInt(match[2]);
                                }
                                
                                // Check if AM/PM is provided (e.g., "4 PM UTC")
                                if (match[3] && match[3] !== undefined) {
                                    const ampm = match[3].toLowerCase();
                                    if (ampm === 'pm' && hour !== 12) hour += 12;
                                    if (ampm === 'am' && hour === 12) hour = 0;
                                }
                                
                                // Set the time directly as UTC (no timezone conversion needed)
                                date.setUTCHours(hour, minute, 0, 0);
                            }
                        }
                        matched = true;
                        break;
                    }
                }
                
                if (!matched) {
                    // Fallback: try to parse the input directly
                    let parsedDate = new Date(input);
                    
                    // If it's a valid date, use it
                    if (!isNaN(parsedDate.getTime())) {
                        date = parsedDate;
                    } else {
                        throw new Error('Could not parse date format');
                    }
                }
            }
            
            // ALL time inputs are treated as UTC time directly
            let utcTimestamp;
            
            // Extract the parsed time components and create UTC timestamp
            const year = date.getFullYear();
            const month = date.getMonth();
            const day = date.getDate();
            const hour = date.getHours();
            const minute = date.getMinutes();
            
            // Create UTC timestamp directly - ALL times are treated as UTC
            utcTimestamp = Date.UTC(year, month, day, hour, minute, 0, 0);
            
            // Ensure the UTC time is in the future
            if (utcTimestamp <= now.getTime()) {
                // If the UTC time is in the past, add 24 hours to move to next day
                utcTimestamp += 24 * 60 * 60 * 1000;
            }
            
            return {
                timestamp: utcTimestamp,
                formatted: `August ${new Date(utcTimestamp).getUTCDate()}, ${new Date(utcTimestamp).getUTCFullYear()} at ${new Date(utcTimestamp).getUTCHours().toString().padStart(2, '0')}:${new Date(utcTimestamp).getUTCMinutes().toString().padStart(2, '0')} UTC`,
                relative: this.getRelativeTime(new Date(utcTimestamp)),
                utcInfo: `UTC: ${this.formatUTCTime(utcTimestamp)}`
            };
        } catch (error) {
            console.error('Error parsing date:', error);
            return null;
        }
    },

    // Get relative time (e.g., "in 2 hours", "in 3 days")
    getRelativeTime(targetDate) {
        const now = new Date();
        const diff = targetDate.getTime() - now.getTime();
        
        if (diff < 0) {
            return 'Event has passed';
        }
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `in ${days} day${days === 1 ? '' : 's'}`;
        } else if (hours > 0) {
            return `in ${hours} hour${hours === 1 ? '' : 's'}`;
        } else if (minutes > 0) {
            return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
        } else {
            return 'starting now';
        }
    },

    // Format event time display with Discord timestamp format
    formatEventTime(timestamp) {
        const now = new Date();
        const eventDate = new Date(timestamp);
        const diff = eventDate.getTime() - now.getTime();
        
        if (diff < 0) {
            return '⏰ **Event has passed**';
        }
        
        // Return Discord timestamp format for full date/time
        return `<t:${Math.floor(timestamp / 1000)}:F>`;
    },

    // Get relative timestamp for countdown display
    getRelativeTimestamp(timestamp) {
        const now = new Date();
        const eventDate = new Date(timestamp);
        const diff = eventDate.getTime() - now.getTime();
        
        if (diff < 0) {
            return '⏰ **Event has passed**';
        }
        
        // Return Discord timestamp format for relative time (countdown)
        return `<t:${Math.floor(timestamp / 1000)}:R>`;
    },

    // Format UTC time in a readable format
    formatUTCTime(timestamp) {
        const date = new Date(timestamp);
        const utcDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        const utcTime = new Date(date.getUTCHours(), date.getUTCMinutes());
        
        const dateStr = utcDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        const timeStr = utcTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        return `${dateStr} at ${timeStr} UTC`;
    },

    // Helper method to load event signups from database
    async loadEventSignups(interaction, eventName, db) {
        try {
            // Initialize event signups storage if it doesn't exist
            if (!interaction.client.eventSignups) {
                interaction.client.eventSignups = new Map();
            }

            // Load existing signups from database for this event
            const existingSignups = await db.getEventSignups(interaction.guildId, eventName);
            existingSignups.forEach((signups, key) => {
                interaction.client.eventSignups.set(key, signups);
            });

            console.log(`Loaded ${existingSignups.size} signup entries for event: ${eventName}`);
        } catch (error) {
            console.error('Error loading event signups:', error);
        }
    },

    // Helper method to load ALL event signups from database (for bot startup/recovery)
    async loadAllEventSignups(interaction, db) {
        try {
            // Initialize event signups storage if it doesn't exist
            if (!interaction.client.eventSignups) {
                interaction.client.eventSignups = new Map();
            }

            // Get all events from the database
            const events = await db.getEvents(interaction.guildId);
            console.log(`Loading signups for ${events.length} events...`);

            // Load signups for each event
            for (const event of events) {
                const existingSignups = await db.getEventSignups(interaction.guildId, event.name);
                existingSignups.forEach((signups, key) => {
                    interaction.client.eventSignups.set(key, signups);
                });
                console.log(`Loaded ${existingSignups.size} signup entries for event: ${event.name}`);
            }

            console.log(`✅ Total signup entries loaded: ${interaction.client.eventSignups.size}`);
        } catch (error) {
            console.error('Error loading all event signups:', error);
        }
    },

    async handleInteractiveCreate(interaction, db) {
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission`);
        } else {
            // Check if user has event permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'event');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct event permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have event permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'event');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has event permission through role: ${role.name}`);
                            break;
                        }
                    } catch (error) {
                        console.error(`Error checking role ${role.id} permission:`, error);
                    }
                }
            }
        }

        if (!hasPermission) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Permission Denied')
                .setDescription('You do not have permission to create events.\n\n**Required:** Administrator role or event permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get the command parameters
        const eventName = interaction.options.getString('name');
        const eventDate = interaction.options.getString('date');
        const eventTime = interaction.options.getString('time');
        
        // Combine date and time for parsing
        const dateTimeInput = `${eventDate} ${eventTime}`.trim();
        
        // Parse the date and time
        const parsedDateTime = this.parseDateTime(dateTimeInput);
        if (!parsedDateTime) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Date/Time Format')
                .setDescription(`Could not parse the date/time: "${dateTimeInput}"\n\n**Supported Formats:**\n• **Relative:** "tomorrow at 8 PM", "in 2 hours", "next week 3pm"\n• **Natural:** "this evening", "tonight", "Jan 15 8 PM"\n• **24hr:** "20:00", "14:30"\n• **Date + Time:** "8/25 23:59", "12/31 16:00"\n• **UTC Explicit:** "8/25 04 UTC", "12/31 16 UTC"\n• **Standard:** "2024-01-15 20:00"`)
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Store event data with the parsed information
        const eventData = {
            name: eventName,
            dateTime: dateTimeInput,
            timestamp: parsedDateTime.timestamp,
            formattedDateTime: parsedDateTime.formatted,
            relativeTime: parsedDateTime.relative,
            contentType: '',
            compName: '',
            createdBy: interaction.user.id,
            createdAt: new Date()
        };

        // Store the event data temporarily
        interaction.client.eventData = interaction.client.eventData || new Map();
        interaction.client.eventData.set(interaction.user.id, eventData);

        // Show content type selection directly (skip name and date/time steps)
        await this.showContentTypeSelection(interaction, db, eventData);
    },

    async handleButtonInteraction(interaction, db) {
        try {
            const userId = interaction.user.id;
            const eventData = interaction.client.eventData?.get(userId) || {};

            console.log(`Event interaction: ${interaction.customId} by user ${userId}`);
            console.log('Current event data:', eventData);

            // Handle button interactions
            switch (interaction.customId) {
                case 'event_content_type':
                    console.log('Opening content type selection...');
                    await this.showContentTypeSelection(interaction, db, eventData);
                    break;
                case 'event_comp':
                    console.log('Opening Comp Sheet selection...');
                    await this.showCompSelection(interaction, db, eventData);
                    break;
                case 'event_create':
                    console.log('Finalizing event...');
                    await this.finalizeEvent(interaction, db, eventData);
                    break;
                case 'event_create_now':
                    console.log('Creating event now (skipping optional steps)...');
                    await this.finalizeEvent(interaction, db, eventData);
                    break;
                case 'event_continue':
                    console.log('Continuing with optional steps...');
                    // Hide the action buttons and show only content type selection
                    await this.showContentTypeSelectionOnly(interaction, db, eventData);
                    break;

                case 'event_cancel':
                    console.log('Cancelling event...');
                    await this.cancelEvent(interaction);
                    break;
                case 'event_confirm_cancel':
                    console.log('Confirming event cancellation...');
                    await this.handleConfirmEventCancel(interaction, db);
                    break;
                case 'event_cancel_cancel':
                    console.log('Keeping event...');
                    await this.handleKeepEvent(interaction);
                    break;
                default:
                    console.log(`Unknown interaction: ${interaction.customId}`);
            }
        } catch (error) {
            console.error('Error in handleButtonInteraction:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your interaction. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async showContentTypeSelection(interaction, db, eventData) {
        try {
            // Create action buttons row with Create Event and Continue options
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('event_create_now')
                        .setLabel('✅ Create Event Now')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('event_continue')
                        .setLabel('➡️ Choose Content Type')
                        .setStyle(ButtonStyle.Primary)
                );

            // Create a new embed for step 1 (content type selection)
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📅 Event Creation')
                .setDescription(`**Step 1:** Choose an optional content type for your event, or create the event now.\n\n**Event Name:** ${eventData.name}\n**Date & Time:** ${eventData.formattedDateTime || eventData.dateTime}\n**⏰ Time until event:** ${eventData.relativeTime || 'Unknown'}`)
                .setFooter({ text: 'Phoenix Assistance Bot • Step 1 of 2' })
                .setTimestamp();

            // Check if this is an initial reply or an update
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: [embed],
                    components: [actionButtons]
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                    components: [actionButtons],
                    ephemeral: true
                });
            }
            console.log('Message updated to content type selection with action buttons');
        } catch (error) {
            console.error('Error showing content type selection:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ An error occurred while loading content types. Please try again.',
                    ephemeral: true
                });
            }
        }
    },

    async showContentTypeSelectionOnly(interaction, db, eventData) {
        try {
            // Get available content types
            const contentTypes = await db.getContentTypes(interaction.guildId);
            console.log('Available content types for event:', contentTypes);

            // Create content type dropdown
            const contentTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('event_content_type_select')
                .setPlaceholder('Select content type (optional)')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('No Content Type')
                        .setDescription('General event without specific content type')
                        .setValue('none')
                        .setEmoji('📄'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('General')
                        .setDescription('General purpose event')
                        .setValue('General')
                        .setEmoji('📄'),
                    ...contentTypes.map(ct => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(ct)
                            .setDescription(`Event for ${ct}`)
                            .setValue(ct)
                            .setEmoji('🎯')
                    )
                ]);

            const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

            // Create a new embed for step 1 (without action buttons)
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📅 Event Creation')
                .setDescription(`**Step 1:** Choose an optional content type for your event.\n\n**Event Name:** ${eventData.name}\n**Date & Time:** ${eventData.dateTime}`)
                .setFooter({ text: 'Phoenix Assistance Bot • Step 1 of 2' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: [contentTypeRow]
            });
            console.log('Message updated to content type selection only (step 1 without action buttons)');
        } catch (error) {
            console.error('Error showing content type selection only:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading content types. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleContentTypeSelection(interaction, db) {
        try {
            const userId = interaction.user.id;
            const eventData = interaction.client.eventData?.get(userId) || {};
            const selectedContentType = interaction.values[0];

            console.log(`Content type selected for event: ${selectedContentType}`);
            
            // Update the event data - convert 'none' to empty string for storage
            eventData.contentType = selectedContentType === 'none' ? '' : selectedContentType;
            interaction.client.eventData.set(userId, eventData);

            // Skip the comp sheet button and go directly to comp sheet selection
            await this.showCompSelection(interaction, db, eventData);
        } catch (error) {
            console.error('Error handling content type selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing content type selection. Please try again.',
                ephemeral: true
            });
        }
    },

    async showCompSelection(interaction, db, eventData) {
        try {
            // Get available compositions
            let comps;
            if (eventData.contentType && eventData.contentType !== '' && eventData.contentType !== 'none') {
                comps = await db.getComps(interaction.guildId, eventData.contentType);
            } else {
                comps = await db.getComps(interaction.guildId, null);
            }

            if (comps.length === 0) {
                // No compositions available, show final step without composition
                await this.showFinalStep(interaction, eventData);
                return;
            }

            // Create composition dropdown
            const compSelect = new StringSelectMenuBuilder()
                .setCustomId('event_comp_select')
                .setPlaceholder('Select Comp Sheet (optional)')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('No Comp Sheet')
                        .setDescription('Event without specific Comp Sheet')
                        .setValue('none')
                        .setEmoji('📄'),
                    ...comps.map(comp => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(comp.name || 'Unnamed Composition')
                            .setDescription(`${comp.builds?.length || 0} builds | ${comp.contentType || 'Unknown'}`)
                            .setValue(comp.name || 'Unnamed Composition')
                            .setEmoji('🎭')
                    )
                ]);

            const compRow = new ActionRowBuilder().addComponents(compSelect);

            // Create action buttons row with Create Event button only
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('event_create_now')
                        .setLabel('✅ Create Event Now')
                        .setStyle(ButtonStyle.Success)
                );

            // Create a new embed for composition selection
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📅 Event Creation')
                .setDescription(`**Step 2:** Choose an optional Comp Sheet for your event, or create the event now.\n\n**Event Name:** ${eventData.name}\n**Date & Time:** ${eventData.formattedDateTime || eventData.dateTime}\n**⏰ Time until event:** ${eventData.relativeTime || 'Unknown'}\n**Content Type:** ${eventData.contentType || 'None'}`)
                .setFooter({ text: 'Phoenix Assistance Bot • Step 2 of 2' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: [compRow, actionButtons]
            });
            console.log('Message updated to Comp Sheet selection with dropdown and Create Event button');
        } catch (error) {
            console.error('Error showing Comp Sheet selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading Comp Sheet. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleCompSelection(interaction, db) {
        try {
            const userId = interaction.user.id;
            const eventData = interaction.client.eventData?.get(userId) || {};
            const selectedCompName = interaction.values[0];

            console.log(`Comp Sheet selected for event: ${selectedCompName}`);
            
            // Update the event data - convert 'none' to empty string for storage
            eventData.compName = selectedCompName === 'none' ? '' : selectedCompName;
            interaction.client.eventData.set(userId, eventData);

            // Show final step
            await this.showFinalStep(interaction, eventData);
        } catch (error) {
            console.error('Error handling Comp Sheet selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing Comp Sheet selection. Please try again.',
                ephemeral: true
            });
        }
    },

    async showFinalStep(interaction, eventData) {
        try {
            // Create final embed with all event details
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📅 Event Creation - Final Step')
                .setDescription('**Review your event details below and click Create Event to finalize.**')
                .addFields(
                    { name: '📝 Event Name', value: eventData.name, inline: true },
                    { name: '📅 Date & Time', value: eventData.timestamp ? this.formatEventTime(eventData.timestamp) : (eventData.formattedDateTime || eventData.dateTime), inline: true },
                    { name: '⏰ Time until event', value: eventData.timestamp ? this.getRelativeTimestamp(eventData.timestamp) : (eventData.relativeTime || 'Unknown'), inline: true },
                    { name: '🎯 Content Type', value: eventData.contentType || 'None', inline: true },
                    { name: '🎭 Comp Sheet', value: eventData.compName || 'None', inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Final Step' })
                .setTimestamp();

            // Create action buttons
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('event_create')
                        .setLabel('✅ Create Event')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('event_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            // Update the message with final step
            await interaction.update({
                embeds: [embed],
                components: [actionButtons]
            });
            console.log('Message updated to final step');
        } catch (error) {
            console.error('Error showing final step:', error);
            await interaction.reply({
                content: '❌ An error occurred while showing final step. Please try again.',
                ephemeral: true
            });
        }
    },

    async finalizeEvent(interaction, db, eventData) {
        try {
            const userId = interaction.user.id;
            console.log(`Finalizing event for user ${userId}`);
            console.log('Event data to finalize:', eventData);
            
            // Check if all required fields are filled
            if (!eventData.name || !eventData.dateTime) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Missing Required Fields')
                    .setDescription('Please fill in the event name and date/time.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Save to database
            const eventDataToSave = {
                ...eventData,
                createdBy: userId,
                createdAt: new Date().toISOString()
            };
            
            const success = await db.addEvent(interaction.guildId, eventDataToSave);

            if (success) {
                // Clear the event data
                interaction.client.eventData.delete(userId);
                console.log(`Event data cleared for user ${userId}`);
                
                // Acknowledge the event creation (ephemeral, only visible to creator)
                await interaction.update({
                    content: `✅ Event **${eventData.name}** created successfully!`,
                    embeds: [],
                    components: []
                });
                
                // Post the event details publicly in the channel
                const publicEventEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle(`📅 **${eventData.name}**`)
                    .setDescription(`**New Event**`)
                    .addFields(
                        { name: '📅 **Date & Time**', value: eventData.timestamp ? this.formatEventTime(eventData.timestamp) : (eventData.formattedDateTime || eventData.dateTime), inline: false },
                        { name: '⏰ **Time until event**', value: this.getRelativeTimestamp(eventData.timestamp), inline: false },
                        { name: '🎯 **Content Type**', value: eventData.contentType || 'General', inline: true },
                        { name: '👤 **Organizer**', value: `<@${eventData.createdBy}>`, inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot • Event Created' })
                    .setTimestamp();

                // Add composition details if one was selected
                let selectedComp = null;
                if (eventData.compName && eventData.compName !== '') {
                    try {
                        // Get the composition details to show the build list
                        if (eventData.contentType && eventData.contentType !== '') {
                            const contentTypeComps = await db.getComps(interaction.guildId, eventData.contentType);
                            selectedComp = contentTypeComps.find(comp => comp.name === eventData.compName);
                        }
                        
                        if (!selectedComp) {
                            const generalComps = await db.getComps(interaction.guildId, null);
                            selectedComp = generalComps.find(comp => comp.name === eventData.compName);
                        }
                        
                        if (selectedComp && selectedComp.builds && selectedComp.builds.length > 0) {
                            const buildList = selectedComp.builds.map((build, index) => 
                                `${index + 1}. **${build.name || build}** - *No signups*`
                            ).join('\n');
                            
                            publicEventEmbed.addFields({
                                name: '🎭 **Comp Sheet**',
                                value: `${eventData.compName}\n\n**Builds:**\n${buildList}`,
                                inline: false
                            });
                        } else {
                            publicEventEmbed.addFields({
                                name: '🎭 **Comp Sheet**',
                                value: eventData.compName,
                                inline: true
                            });
                        }
                    } catch (error) {
                        console.error('Error fetching Comp Sheet details for public post:', error);
                        publicEventEmbed.addFields({
                            name: '🎭 **Comp Sheet**',
                            value: eventData.compName,
                            inline: true
                        });
                    }
                }

                // Initialize event signups storage if it doesn't exist
                if (!interaction.client.eventSignups) {
                    interaction.client.eventSignups = new Map();
                }

                // Load existing signups from database for this event
                await this.loadEventSignups(interaction, eventData.name, db);

                // Create build signup buttons if there's a composition
                let buttonRows = [];
                if (selectedComp && selectedComp.builds && selectedComp.builds.length > 0) {
                    buttonRows = this.createBuildSignupButtons(selectedComp.builds, eventData.name, interaction.client.eventSignups, userId);
                }

                // Send the public event announcement with buttons
                await interaction.channel.send({ 
                    embeds: [publicEventEmbed], 
                    components: buttonRows 
                });
                console.log('Public event announcement posted to channel with build signup buttons');
                
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Create Event')
                    .setDescription('Failed to create event. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Event creation failed in database');
            }
        } catch (error) {
            console.error('Error in finalizeEvent:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Creating Event')
                .setDescription('An unexpected error occurred while creating the event. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async cancelEvent(interaction) {
        const userId = interaction.user.id;
        interaction.client.eventData.delete(userId);

        const embed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('❌ Event Creation Cancelled')
            .setDescription('Event creation has been cancelled. All data has been cleared.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });
    },

    async handleList(interaction, db) {
        try {
            // Get all events from the database
            const events = await db.getEvents(interaction.guildId);

            if (events.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📅 Events')
                    .setDescription('No events found for this guild.')
                    .addFields(
                        { name: '💡 Tip', value: 'Use `/event create` to add your first event!', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Create events display embed
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📅 Guild Events')
                .setDescription(`Found **${events.length}** event(s):`)
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Add each event as a field
            events.forEach((event, index) => {
                const timeDisplay = event.timestamp ? this.formatEventTime(event.timestamp) : event.dateTime;
                const relativeTime = event.timestamp ? this.getRelativeTimestamp(event.timestamp) : 'Unknown';
                
                const eventInfo = [
                    `📅 **Date & Time:** ${timeDisplay}`,
                    `⏰ **Time until event:** ${relativeTime}`,
                    `🎯 **Content Type:** ${event.contentType || 'None'}`,
                    `🎭 **Comp Sheet:** ${event.compName || 'None'}`,
                    `👤 **Created by:** <@${event.createdBy}>`,
                    `📅 **Created:** ${new Date(event.createdAt).toLocaleDateString()}`
                ].join('\n');

                embed.addFields({
                    name: `📅 ${event.name}`,
                    value: eventInfo,
                    inline: false
                });
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error in handleList:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while listing events.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleCancel(interaction, db) {
        try {
            // Get all events from the database
            const events = await db.getEvents(interaction.guildId);

            if (events.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📅 Cancel Event')
                    .setDescription('No events found for this guild.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Create event selection dropdown
            const eventSelect = new StringSelectMenuBuilder()
                .setCustomId('event_cancel_select')
                .setPlaceholder('Select an event to cancel')
                .addOptions(
                    events.map(event => {
                        const timeDisplay = event.timestamp ? this.formatEventTime(event.timestamp) : event.dateTime;
                        return new StringSelectMenuOptionBuilder()
                            .setLabel(event.name)
                            .setDescription(`${timeDisplay} | ${event.contentType || 'No content type'}`)
                            .setValue(event.name)
                            .setEmoji('📅');
                    })
                );

            const eventRow = new ActionRowBuilder().addComponents(eventSelect);

            // Create the main embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Cancel Event')
                .setDescription('Select an event from the dropdown below to cancel it.')
                .setFooter({ text: 'Phoenix Assistance Bot • Select event to cancel' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                components: [eventRow],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in handleCancel:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading events for cancellation.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleCancelSelection(interaction, db) {
        try {
            const selectedEventName = interaction.values[0];
            console.log('Event selected for cancellation:', selectedEventName);

            // Get the specific event details
            const events = await db.getEvents(interaction.guildId);
            const selectedEvent = events.find(event => event.name === selectedEventName);

            if (selectedEvent) {
                // Create detailed event view embed for cancellation
                const detailedEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`❌ ${selectedEvent.name}`)
                    .setDescription(`**Event Information - Ready for Cancellation**`)
                    .addFields(
                        { name: '📅 Date & Time', value: selectedEvent.dateTime, inline: true },
                        { name: '🎯 Content Type', value: selectedEvent.contentType || 'None', inline: true },
                        { name: '🎭 Comp Sheet', value: selectedEvent.compName || 'None', inline: true },
                        { name: '👤 Created by', value: `<@${selectedEvent.createdBy}>`, inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot • Confirm cancellation below' })
                    .setTimestamp();

                // Add creation info if available
                if (selectedEvent.createdAt) {
                    const createdDate = new Date(selectedEvent.createdAt).toLocaleDateString();
                    detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
                }

                // Create confirm and cancel buttons
                const actionButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('event_confirm_cancel')
                            .setLabel('❌ Confirm Cancel Event')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('event_cancel_cancel')
                            .setLabel('✅ Keep Event')
                            .setStyle(ButtonStyle.Success)
                    );

                // Update the message with detailed event view and action buttons
                await interaction.update({
                    embeds: [detailedEmbed],
                    components: [actionButtons]
                });
                console.log('Event details displayed successfully for cancellation with action buttons');
            } else {
                await interaction.update({
                    content: `❌ Event "${selectedEventName}" not found.`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error handling event cancellation selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing event cancellation selection. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleConfirmEventCancel(interaction, db) {
        try {
            // Extract event name from the embed title
            const embedTitle = interaction.message.embeds[0].title;
            const eventName = embedTitle.replace('❌ ', ''); // Remove the ❌ emoji

            console.log(`Event cancellation confirmed for: ${eventName}`);

            // Delete the event from the database
            const success = await db.deleteEvent(interaction.guildId, eventName);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Event Cancelled!')
                    .setDescription(`**${eventName}** has been cancelled.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log(`Event ${eventName} cancelled successfully`);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Cancel Event')
                    .setDescription(`Failed to cancel event **${eventName}**. Please try again.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log(`Event ${eventName} cancellation failed in database`);
            }
        } catch (error) {
            console.error('Error in handleConfirmEventCancel:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Cancelling Event')
                .setDescription('An unexpected error occurred while cancelling the event. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async handleKeepEvent(interaction) {
        try {
            // Extract event name from the embed title
            const embedTitle = interaction.message.embeds[0].title;
            const eventName = embedTitle.replace('❌ ', ''); // Remove the ❌ emoji

            console.log(`Event kept: ${eventName}`);

            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('✅ Event Kept')
                .setDescription(`**${eventName}** has been kept.`)
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: []
            });
            console.log(`Event ${eventName} kept successfully`);
        } catch (error) {
            console.error('Error in handleKeepEvent:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An unexpected error occurred while keeping the event. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    // Create build sign-up buttons for the public event announcement
    createBuildSignupButtons(builds, eventName, eventSignups = null, currentUserId = null) {
        const buttons = [];
        
        builds.forEach((build, index) => {
            const buildName = build.name || build;
            const signupKey = `event_${eventName}_build_${index}`;
            const signups = eventSignups?.get(signupKey) || [];
            const isTaken = signups.length > 0;
            const isTakenByCurrentUser = isTaken && currentUserId && signups.includes(currentUserId);
            
            // Only show "Remove me" if the current user owns this build
            // Otherwise show "Taken" for all other users
            let buttonLabel;
            if (isTaken) {
                if (isTakenByCurrentUser) {
                    buttonLabel = `${buildName} - Taken`;
                } else {
                    buttonLabel = `${buildName} - Taken`;
                }
            } else {
                buttonLabel = `Sign up for ${buildName}`;
            }
            
            const button = new ButtonBuilder()
                .setCustomId(`event_signup_${eventName}_${index}`)
                .setLabel(buttonLabel)
                .setStyle(isTaken ? (isTakenByCurrentUser ? ButtonStyle.Danger : ButtonStyle.Secondary) : ButtonStyle.Primary)
                .setEmoji(isTaken ? (isTakenByCurrentUser ? '❌' : '🔒') : '✅')
                .setDisabled(false); // Always enabled so users can remove themselves
            
            buttons.push(button);
        });
        
        // Group buttons into rows of 3 (Discord limit)
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 3));
            buttonRows.push(row);
        }
        
        return buttonRows;
    },

    // Handle build sign-up button interactions
    async handleBuildSignup(interaction, db) {
        try {
            const customId = interaction.customId;
            const parts = customId.split('_');
            const eventName = parts[2];
            const buildIndex = parseInt(parts[3]);
            const userId = interaction.user.id;
            const userName = interaction.user.username;
            
            console.log(`Build signup: User ${userName} (${userId}) signing up for build ${buildIndex} in event ${eventName}`);
            
            // Get the event details
            const events = await db.getEvents(interaction.guildId);
            const event = events.find(e => e.name === eventName);
            
            if (!event) {
                await interaction.reply({
                    content: '❌ Event not found.',
                    ephemeral: true
                });
                return;
            }

            // Load existing signups for this event from database
            await this.loadEventSignups(interaction, eventName, db);
            
            // Get the composition details
            let selectedComp = null;
            if (event.contentType && event.contentType !== '') {
                const contentTypeComps = await db.getComps(interaction.guildId, event.contentType);
                selectedComp = contentTypeComps.find(comp => comp.name === event.compName);
            }
            
            if (!selectedComp) {
                const generalComps = await db.getComps(interaction.guildId, null);
                selectedComp = generalComps.find(comp => comp.name === event.compName);
            }
            
            if (!selectedComp || !selectedComp.builds || !selectedComp.builds[buildIndex]) {
                await interaction.reply({
                    content: '❌ Build not found.',
                    ephemeral: true
                });
                return;
            }
            
            const buildName = selectedComp.builds[buildIndex].name || selectedComp.builds[buildIndex];
            
            // Check if this build is already taken by someone else
            const signupKey = `event_${eventName}_build_${buildIndex}`;
            const currentSignups = interaction.client.eventSignups?.get(signupKey) || [];
            
            if (currentSignups.includes(userId)) {
                // User is already signed up for this build, remove them
                const newSignups = currentSignups.filter(id => id !== userId);
                interaction.client.eventSignups.set(signupKey, newSignups);
                
                // Also remove from database
                await db.removeEventSignup(interaction.guildId, eventName, buildIndex, userId);
                
                // Acknowledge the button interaction without showing a message
                await interaction.deferUpdate();
            } else {
                // Check if this build is already taken by someone else
                if (currentSignups.length > 0) {
                    await interaction.reply({
                        content: `❌ **${buildName}** is already taken by <@${currentSignups[0]}>. Please choose a different build.`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Check if user is already signed up for any other build in this event
                let userAlreadySignedUp = false;
                let userCurrentBuild = '';
                
                for (let i = 0; i < selectedComp.builds.length; i++) {
                    const otherSignupKey = `event_${eventName}_build_${i}`;
                    const otherSignups = interaction.client.eventSignups?.get(otherSignupKey) || [];
                    
                    if (otherSignups.includes(userId)) {
                        userAlreadySignedUp = true;
                        userCurrentBuild = selectedComp.builds[i].name || selectedComp.builds[i];
                        break;
                    }
                }
                
                if (userAlreadySignedUp) {
                    await interaction.reply({
                        content: `❌ You are already signed up for **${userCurrentBuild}**. Please remove yourself from that build first if you want to change.`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Add user to signups (only one user per build)
                interaction.client.eventSignups.set(signupKey, [userId]);
                
                // Also add to database
                await db.addEventSignup(interaction.guildId, eventName, buildIndex, userId);
                
                // Acknowledge the button interaction without showing a message
                await interaction.deferUpdate();
            }
            
            // Update the public event message with new signup information
            await this.updatePublicEventMessage(interaction, event, selectedComp);
            
        } catch (error) {
            console.error('Error handling build signup:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your signup. Please try again.',
                ephemeral: true
            });
        }
    },

    // Update the public event message with current signup information
    async updatePublicEventMessage(interaction, event, composition) {
        try {
            // Create the updated embed
            const publicEventEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle(`📅 **${event.name}**`)
                .setDescription(`**New Event Created!**`)
                .addFields(
                    { name: '📅 **Date & Time**', value: event.timestamp ? this.formatEventTime(event.timestamp) : (event.formattedDateTime || event.dateTime), inline: false },
                    { name: '⏰ **Time until event**', value: this.getRelativeTimestamp(event.timestamp), inline: false },
                    { name: '🎯 **Content Type**', value: event.contentType || 'General', inline: true },
                    { name: '👤 **Organizer**', value: `<@${event.createdBy}>`, inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Event Created' })
                .setTimestamp();

            // Add composition details with current signups
            if (composition && composition.builds && composition.builds.length > 0) {
                const buildList = composition.builds.map((build, index) => {
                    const buildName = build.name || build;
                    const signupKey = `event_${event.name}_build_${index}`;
                    const signups = interaction.client.eventSignups?.get(signupKey) || [];
                    
                    if (signups.length === 0) {
                        return `${index + 1}. **${buildName}** - *No signups*`;
                    } else {
                        const userMentions = signups.map(id => `<@${id}>`).join(', ');
                        return `${index + 1}. **${buildName}** - ${userMentions}`;
                    }
                }).join('\n');
                
                publicEventEmbed.addFields({
                    name: '🎭 **Comp Sheet**',
                    value: `${event.compName}\n\n**Builds:**\n${buildList}`,
                    inline: false
                });
            }

            // Create build signup buttons - we need to pass the current user ID for proper button states
            const buttonRows = this.createBuildSignupButtons(composition.builds || [], event.name, interaction.client.eventSignups, interaction.user.id);
            
            // Find and update the original message
            const channel = interaction.channel;
            const messages = await channel.messages.fetch({ limit: 50 });
            const eventMessage = messages.find(msg => 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === `📅 **${event.name}**` &&
                msg.author.id === interaction.client.user.id
            );
            
            if (eventMessage) {
                await eventMessage.edit({
                    embeds: [publicEventEmbed],
                    components: buttonRows
                });
                console.log('Public event message updated with new signup information');
            }
            
        } catch (error) {
            console.error('Error updating public event message:', error);
        }
    }
};


