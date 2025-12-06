const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voice-channel')
        .setDescription('Manage join-to-create voice channels')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up a join-to-create voice channel')
                .addChannelOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category to create voice channels in')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name for the join-to-create channel')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('user-limit')
                        .setDescription('Maximum users allowed in created channels (0 for unlimited)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(99)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove join-to-create voice channel setup')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List current join-to-create voice channel setups')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, db) {
        if (!db) {
            console.error('Database manager not found');
            await interaction.reply({
                content: '❌ Database connection error. Please try again later.',
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'setup':
                    await this.handleSetup(interaction, db);
                    break;
                case 'remove':
                    await this.handleRemove(interaction, db);
                    break;
                case 'list':
                    await this.handleList(interaction, db);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Unknown subcommand.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in voice-channel command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing the command. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleSetup(interaction, db) {
        const category = interaction.options.getChannel('category');
        const channelName = interaction.options.getString('name') || 'Join to Create';
        const userLimit = interaction.options.getInteger('user-limit') || 0;

        // Check if user has permission to manage channels
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await interaction.reply({
                content: '❌ You need the "Manage Channels" permission to use this command.',
                ephemeral: true
            });
            return;
        }

        // Check if bot has permission to manage channels
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await interaction.reply({
                content: '❌ I need the "Manage Channels" permission to create voice channels.',
                ephemeral: true
            });
            return;
        }

        try {
            // Create the join-to-create voice channel
            const voiceChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.ManageChannels]
                    }
                ]
            });

            // Store the setup in database
            await db.setVoiceChannelSetup(interaction.guildId, {
                channelId: voiceChannel.id,
                categoryId: category.id,
                channelName: channelName,
                userLimit: userLimit,
                createdAt: new Date()
            });

            // Store in client for quick access
            if (!interaction.client.voiceChannelSetups) {
                interaction.client.voiceChannelSetups = new Map();
            }
            interaction.client.voiceChannelSetups.set(interaction.guildId, {
                channelId: voiceChannel.id,
                categoryId: category.id,
                channelName: channelName,
                userLimit: userLimit,
                createdAt: new Date()
            });

            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('✅ Voice Channel Setup Complete')
                .setDescription(`Join-to-create voice channel has been set up successfully!`)
                .addFields(
                    { name: 'Channel', value: `${voiceChannel}`, inline: true },
                    { name: 'Category', value: `${category}`, inline: true },
                    { name: 'User Limit', value: userLimit === 0 ? 'Unlimited' : userLimit.toString(), inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating voice channel:', error);
            await interaction.reply({
                content: '❌ Failed to create the voice channel. Please check my permissions and try again.',
                ephemeral: true
            });
        }
    },

    async handleRemove(interaction, db) {
        // Check if user has permission to manage channels
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await interaction.reply({
                content: '❌ You need the "Manage Channels" permission to use this command.',
                ephemeral: true
            });
            return;
        }

        try {
            // Get current setup
            const setup = await db.getVoiceChannelSetup(interaction.guildId);
            
            if (!setup) {
                await interaction.reply({
                    content: '❌ No join-to-create voice channel setup found.',
                    ephemeral: true
                });
                return;
            }

            // Delete the voice channel if it still exists
            const voiceChannel = interaction.guild.channels.cache.get(setup.channelId);
            if (voiceChannel) {
                await voiceChannel.delete();
            }

            // Remove from database
            await db.removeVoiceChannelSetup(interaction.guildId);

            // Remove from client
            if (interaction.client.voiceChannelSetups) {
                interaction.client.voiceChannelSetups.delete(interaction.guildId);
            }

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('✅ Voice Channel Setup Removed')
                .setDescription('Join-to-create voice channel setup has been removed successfully!')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error removing voice channel setup:', error);
            await interaction.reply({
                content: '❌ Failed to remove the voice channel setup. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleList(interaction, db) {
        try {
            const setup = await db.getVoiceChannelSetup(interaction.guildId);
            
            if (!setup) {
                await interaction.reply({
                    content: '❌ No join-to-create voice channel setup found.',
                    ephemeral: true
                });
                return;
            }

            const voiceChannel = interaction.guild.channels.cache.get(setup.channelId);
            const category = interaction.guild.channels.cache.get(setup.categoryId);

            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('📋 Voice Channel Setup')
                .setDescription('Current join-to-create voice channel configuration:')
                .addFields(
                    { name: 'Channel', value: voiceChannel ? `${voiceChannel}` : '❌ Channel not found', inline: true },
                    { name: 'Category', value: category ? `${category}` : '❌ Category not found', inline: true },
                    { name: 'Channel Name', value: setup.channelName, inline: true },
                    { name: 'User Limit', value: setup.userLimit === 0 ? 'Unlimited' : setup.userLimit.toString(), inline: true },
                    { name: 'Created', value: `<t:${Math.floor(setup.createdAt.getTime() / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error listing voice channel setup:', error);
            await interaction.reply({
                content: '❌ Failed to retrieve voice channel setup. Please try again.',
                ephemeral: true
            });
        }
    },

    // Handle voice state updates for join-to-create functionality
    async handleVoiceStateUpdate(oldState, newState, client) {
        try {
            const guildId = newState.guild.id;
            const setup = client.voiceChannelSetups?.get(guildId);
            
            // Early return if no setup for this guild
            if (!setup) return;

            // Check if user joined a voice channel
            if (!oldState.channelId && newState.channelId) {
                if (newState.channelId === setup.channelId) {
                    console.log(`🎯 User joined join-to-create channel, creating temporary channel`);
                    // User joined the join-to-create channel
                    await this.createTemporaryChannel(newState, setup);
                }
                return;
            }

            // Check if user left a voice channel
            if (oldState.channelId && !newState.channelId) {
                await this.cleanupEmptyChannel(oldState);
                return;
            }

            // Check if user moved between channels
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                // Clean up the channel they left
                await this.cleanupEmptyChannel(oldState);
                
                // Check if they moved to the join-to-create channel
                if (newState.channelId === setup.channelId) {
                    console.log(`🎯 User moved to join-to-create channel, creating temporary channel`);
                    // User moved to the join-to-create channel
                    await this.createTemporaryChannel(newState, setup);
                }
            }

        } catch (error) {
            console.error('❌ Error handling voice state update:', error);
        }
    },

    async createTemporaryChannel(voiceState, setup) {
        try {
            const guild = voiceState.guild;
            const user = voiceState.member.user;
            
            // Get the join-to-create channel to copy its permissions
            const joinToCreateChannel = guild.channels.cache.get(setup.channelId);
            if (!joinToCreateChannel) {
                console.error('Join-to-create channel not found');
                return;
            }
            
            // Create a temporary voice channel with user's display name or username
            const displayName = voiceState.member.displayName || user.username;
            const channelName = `${displayName}'s Channel`;
            
            // Copy permissions from the join-to-create channel
            const permissionOverwrites = joinToCreateChannel.permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                allow: overwrite.allow.bitfield,
                deny: overwrite.deny.bitfield,
                type: overwrite.type
            }));
            
            // Add specific permissions for the channel creator
            permissionOverwrites.push({
                id: user.id,
                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
                type: 1 // Member type
            });
            
            // Get the position of the join-to-create channel to place the new channel right after it
            const joinToCreatePosition = joinToCreateChannel.position;
            
            const tempChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: setup.categoryId,
                position: joinToCreatePosition + 1, // Place directly under the join-to-create channel
                userLimit: setup.userLimit,
                permissionOverwrites: permissionOverwrites
            });

            // Track this temporary channel by ID (so it can be deleted even if renamed)
            if (!voiceState.client.temporaryChannels) {
                voiceState.client.temporaryChannels = new Map();
            }
            if (!voiceState.client.temporaryChannels.has(guild.id)) {
                voiceState.client.temporaryChannels.set(guild.id, new Set());
            }
            voiceState.client.temporaryChannels.get(guild.id).add(tempChannel.id);

            // Move the user to the new channel
            await voiceState.member.voice.setChannel(tempChannel);

            console.log(`Created temporary voice channel "${channelName}" (ID: ${tempChannel.id}) for user ${user.username} at position ${joinToCreatePosition + 1}`);

        } catch (error) {
            console.error('Error creating temporary voice channel:', error);
        }
    },

    async cleanupEmptyChannel(voiceState) {
        try {
            const channel = voiceState.channel;
            
            // Early returns for invalid channels
            if (!channel || channel.type !== ChannelType.GuildVoice) {
                return;
            }

            // Early return if channel is not empty
            if (channel.members.size > 0) {
                return;
            }

            const guildId = voiceState.guild.id;
            const setup = voiceState.client.voiceChannelSetups?.get(guildId);
            
            // Early return if no setup for this guild
            if (!setup) {
                return;
            }

            // Don't delete the join-to-create channel itself
            if (channel.id === setup.channelId) {
                return;
            }

            const temporaryChannels = voiceState.client.temporaryChannels?.get(guildId);
            
            // Only delete if this channel is tracked as a temporary channel (created by our bot)
            if (temporaryChannels && temporaryChannels.has(channel.id)) {
                // This is a temporary channel created by our bot, delete it immediately when empty
                console.log(`🗑️ Deleting empty temporary voice channel: ${channel.name} (ID: ${channel.id})`);
                
                try {
                    await channel.delete();
                    // Remove from tracking
                    temporaryChannels.delete(channel.id);
                    console.log(`✅ Successfully deleted empty temporary voice channel: ${channel.name}`);
                } catch (deleteError) {
                    console.error(`❌ Failed to delete channel ${channel.id}:`, deleteError);
                    // Remove from tracking if deletion failed (channel might already be deleted)
                    temporaryChannels.delete(channel.id);
                }
            }

        } catch (error) {
            console.error('❌ Error cleaning up empty channel:', error);
        }
    },

    // Method to check all channels for cleanup (called periodically, not on every voice state update)
    // This is useful for cleanup in case channels weren't deleted properly
    async checkAllChannelsForCleanup(guild) {
        try {
            const setup = guild.client.voiceChannelSetups?.get(guild.id);
            if (!setup) return;

            const temporaryChannels = guild.client.temporaryChannels?.get(guild.id);
            if (!temporaryChannels || temporaryChannels.size === 0) return;

            // Create a copy of the set to avoid modification during iteration
            const channelsToCheck = Array.from(temporaryChannels);

            // Check each tracked temporary channel
            for (const channelId of channelsToCheck) {
                try {
                    const channel = guild.channels.cache.get(channelId);
                    
                    // If channel doesn't exist anymore, remove from tracking
                    if (!channel) {
                        temporaryChannels.delete(channelId);
                        continue;
                    }
                    
                    // If channel is empty, delete it
                    if (channel.members.size === 0) {
                        console.log(`🗑️ Found empty temporary voice channel during cleanup check: ${channel.name} (ID: ${channelId})`);
                        await channel.delete();
                        temporaryChannels.delete(channelId);
                        console.log(`✅ Successfully deleted empty temporary voice channel: ${channel.name}`);
                    }
                } catch (deleteError) {
                    console.error(`❌ Failed to delete channel ${channelId}:`, deleteError);
                    // Remove from tracking if deletion failed (channel might already be deleted)
                    temporaryChannels.delete(channelId);
                }
            }
        } catch (error) {
            console.error('❌ Error checking all channels for cleanup:', error);
        }
    }
};
