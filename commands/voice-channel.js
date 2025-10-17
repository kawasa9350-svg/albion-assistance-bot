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
            // Check if user joined a voice channel
            if (!oldState.channelId && newState.channelId) {
                const guildId = newState.guild.id;
                const setup = client.voiceChannelSetups?.get(guildId);
                
                if (setup && newState.channelId === setup.channelId) {
                    // User joined the join-to-create channel
                    await this.createTemporaryChannel(newState, setup);
                }
            }

            // Check if user left a voice channel
            if (oldState.channelId && !newState.channelId) {
                await this.cleanupEmptyChannel(oldState);
            }

            // Check if user moved between channels
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                await this.cleanupEmptyChannel(oldState);
                
                const guildId = newState.guild.id;
                const setup = client.voiceChannelSetups?.get(guildId);
                
                if (setup && newState.channelId === setup.channelId) {
                    // User moved to the join-to-create channel
                    await this.createTemporaryChannel(newState, setup);
                }
            }

        } catch (error) {
            console.error('Error handling voice state update:', error);
        }
    },

    async createTemporaryChannel(voiceState, setup) {
        try {
            const guild = voiceState.guild;
            const user = voiceState.member.user;
            
            // Create a temporary voice channel
            const channelName = `${user.username}'s Channel`;
            
            const tempChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: setup.categoryId,
                userLimit: setup.userLimit,
                permissionOverwrites: [
                    {
                        id: user.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                    },
                    {
                        id: guild.roles.everyone.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.ManageChannels]
                    }
                ]
            });

            // Move the user to the new channel
            await voiceState.member.voice.setChannel(tempChannel);

            console.log(`Created temporary voice channel "${channelName}" for user ${user.username}`);

        } catch (error) {
            console.error('Error creating temporary voice channel:', error);
        }
    },

    async cleanupEmptyChannel(voiceState) {
        try {
            const channel = voiceState.channel;
            if (!channel || channel.type !== ChannelType.GuildVoice) return;

            // Check if channel is empty
            if (channel.members.size === 0) {
                // Check if this is a temporary channel (not the join-to-create channel)
                const guildId = voiceState.guild.id;
                const setup = voiceState.client.voiceChannelSetups?.get(guildId);
                
                if (setup && channel.id !== setup.channelId) {
                    // This is a temporary channel, delete it
                    await channel.delete();
                    console.log(`Deleted empty temporary voice channel: ${channel.name}`);
                }
            }

        } catch (error) {
            console.error('Error cleaning up empty channel:', error);
        }
    }
};
