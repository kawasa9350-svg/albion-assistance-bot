const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootsplit-history')
        .setDescription('View loot split history for the guild')
        .addStringOption(option =>
            option.setName('split_type')
                .setDescription('Filter by content type (leave empty for all)')
                .setRequired(false)
                .setAutocomplete(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Filter by participant (leave empty for all)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of loot splits to show (max 10)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused();
            
            // Get the command to access its database manager
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command || !command.dbManager) {
                console.error('Command or database manager not found for autocomplete');
                await interaction.respond([]);
                return;
            }
            
            const db = command.dbManager;
            
            // Get available content types (returns empty array if guild not registered)
            const contentTypes = await db.getContentTypes(interaction.guildId);
            
            // If no content types, respond empty immediately
            if (!contentTypes || contentTypes.length === 0) {
                await interaction.respond([]);
                return;
            }
            
            // Filter content types based on user input
            const filtered = contentTypes
                .filter(choice => choice.toLowerCase().includes(focusedValue.toLowerCase()))
                .slice(0, 25); // Discord allows max 25 choices

            // Create autocomplete choices
            const choices = filtered.map(contentType => ({
                name: contentType,
                value: contentType
            }));

            await interaction.respond(choices);
        } catch (error) {
            // Don't try to respond if interaction is unknown/expired (error 10062)
            // This is expected when interactions expire after 3 seconds
            if (error.code === 10062) {
                console.warn('Autocomplete interaction expired or unknown, skipping response');
                return;
            }
            // For other errors, log them as errors
            console.error('Error in lootsplit-history autocomplete:', error);
            // Only try to respond if interaction is still valid
            try {
                await interaction.respond([]);
            } catch (respondError) {
                // If responding fails, check if it's also an expired interaction
                if (respondError.code === 10062) {
                    console.warn('Autocomplete interaction expired during error recovery');
                } else {
                    console.error('Failed to respond to autocomplete:', respondError);
                }
            }
        }
    },

    async execute(interaction, db) {
        try {
            // Check if guild is registered
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Guild Not Registered')
                    .setDescription('This guild must be registered first. Use `/guild-register` to get started.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Check if user has permission
            const member = interaction.member;
            let hasPermission = false;
            
            // Check if user is admin
            if (member.permissions.has('Administrator')) {
                hasPermission = true;
            } else {
                // Check if user has lootsplit-history permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'lootsplit-history');
                    if (userHasPermission) {
                        hasPermission = true;
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have lootsplit-history permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'lootsplit-history');
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
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or lootsplit-history permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const splitType = interaction.options.getString('split_type');
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 5;

            // Get all loot splits
            const allLootSplits = await db.getLootSplits(interaction.guildId);
            
            if (!allLootSplits || allLootSplits.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📋 Loot Split History')
                    .setDescription('No loot splits found for this guild.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Filter loot splits based on options
            let filteredSplits = allLootSplits;
            
            if (splitType) {
                filteredSplits = filteredSplits.filter(split => split.splitType === splitType);
            }
            
            if (targetUser) {
                filteredSplits = filteredSplits.filter(split => 
                    split.participants && split.participants.includes(targetUser.id)
                );
            }

            if (filteredSplits.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📋 Loot Split History')
                    .setDescription(`No loot splits found matching your criteria.`)
                    .addFields(
                        { name: '🔍 Filters Applied', value: `Content Type: ${splitType || 'All'}\nUser: ${targetUser ? targetUser.toString() : 'All'}`, inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Sort by creation date (newest first)
            filteredSplits.sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));

            // Limit results
            const limitedSplits = filteredSplits.slice(0, limit);

            // Calculate summary statistics
            const totalSplits = filteredSplits.length;
            const totalLoot = filteredSplits.reduce((sum, split) => sum + (split.totalLoot || 0), 0);
            const totalTax = filteredSplits.reduce((sum, split) => sum + (split.taxAmount || 0), 0);
            const totalParticipants = filteredSplits.reduce((sum, split) => sum + (split.participants?.length || 0), 0);

            // Create the main embed
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📋 Loot Split History')
                .setDescription(`Showing **${limitedSplits.length}** of **${totalSplits}** loot splits`)
                .addFields(
                    { name: '📊 Summary', value: `Total Splits: ${totalSplits}\nTotal Loot: ${totalLoot.toLocaleString()} silver\nTotal Tax: ${totalTax.toLocaleString()} silver\nTotal Participants: ${totalParticipants}`, inline: false }
                );

            // Add filter information if any filters were applied
            if (splitType || targetUser) {
                embed.addFields({
                    name: '🔍 Filters Applied',
                    value: `Content Type: ${splitType || 'All'}\nUser: ${targetUser ? targetUser.toString() : 'All'}`,
                    inline: false
                });
            }

            // Add individual loot split details with cleaner formatting
            for (let i = 0; i < limitedSplits.length; i++) {
                const split = limitedSplits[i];
                const date = split.createdAt || split.timestamp || new Date();
                const formattedDate = new Date(date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Create a cleaner participants list
                let participantsText = 'No participants';
                if (split.participants && split.participants.length > 0) {
                    const participantMentions = split.participants.map(id => `<@${id}>`);
                    participantsText = participantMentions.join('\n');
                }

                embed.addFields({
                    name: `💰 ${split.splitType} - ${formattedDate}`,
                    value: `**Total Loot:** ${(split.totalLoot || 0).toLocaleString()} silver\n**Tax:** ${(split.taxAmount || 0).toLocaleString()} silver\n**Per Player:** ${(split.payoutPerPlayer || 0).toLocaleString()} silver\n**Participants (${split.participants?.length || 0}):**\n${participantsText}`,
                    inline: false
                });
            }

            embed.setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Create navigation buttons if there are more results
            const components = [];
            if (filteredSplits.length > limit) {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('show_more')
                            .setLabel(`Show ${Math.min(limit, filteredSplits.length - limit)} More`)
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('show_all')
                            .setLabel(`Show All (${filteredSplits.length})`)
                            .setStyle(ButtonStyle.Secondary)
                    );
                components.push(row);
            }

            const response = await interaction.reply({ 
                embeds: [embed], 
                components: components.length > 0 ? components : [],
                ephemeral: false,
                fetchReply: true
            });

            // Handle button interactions if buttons were added
            if (components.length > 0) {
                const collector = response.createMessageComponentCollector({ time: 60000 }); // 1 minute timeout
                
                collector.on('collect', async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: '❌ This interaction is not yours to control!', ephemeral: true });
                        return;
                    }

                    if (i.customId === 'show_more') {
                        // Show next batch
                        const nextBatch = filteredSplits.slice(limit, limit + limit);
                        const nextEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('📋 Loot Split History (Next Batch)')
                            .setDescription(`Showing **${nextBatch.length}** more loot splits`)
                            .addFields(
                                { name: '📊 Summary', value: `Total Splits: ${totalSplits}\nTotal Loot: ${totalLoot.toLocaleString()} silver\nTotal Tax: ${totalTax.toLocaleString()} silver\nTotal Participants: ${totalParticipants}`, inline: false }
                            );

                        if (splitType || targetUser) {
                            nextEmbed.addFields({
                                name: '🔍 Filters Applied',
                                value: `Content Type: ${splitType || 'All'}\nUser: ${targetUser ? targetUser.toString() : 'All'}`,
                                inline: false
                            });
                        }

                        for (const split of nextBatch) {
                            const date = split.createdAt || split.timestamp || new Date();
                            const formattedDate = new Date(date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            // Create a cleaner participants list
                            let participantsText = 'No participants';
                            if (split.participants && split.participants.length > 0) {
                                const participantMentions = split.participants.map(id => `<@${id}>`);
                                participantsText = participantMentions.join('\n');
                            }

                            nextEmbed.addFields({
                                name: `💰 ${split.splitType} - ${formattedDate}`,
                                value: `**Total Loot:** ${(split.totalLoot || 0).toLocaleString()} silver\n**Tax:** ${(split.taxAmount || 0).toLocaleString()} silver\n**Per Player:** ${(split.payoutPerPlayer || 0).toLocaleString()} silver\n**Participants (${split.participants?.length || 0}):**\n${participantsText}`,
                                inline: false
                            });
                        }

                        nextEmbed.setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();

                        await i.update({ embeds: [nextEmbed], components: [] });
                    } else if (i.customId === 'show_all') {
                        // Show all results in one embed (might be large)
                        const allEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('📋 Complete Loot Split History')
                            .setDescription(`Showing all **${filteredSplits.length}** loot splits`)
                            .addFields(
                                { name: '📊 Summary', value: `Total Splits: ${totalSplits}\nTotal Loot: ${totalLoot.toLocaleString()} silver\nTotal Tax: ${totalTax.toLocaleString()} silver\nTotal Participants: ${totalParticipants}`, inline: false }
                            );

                        if (splitType || targetUser) {
                            allEmbed.addFields({
                                name: '🔍 Filters Applied',
                                value: `Content Type: ${splitType || 'All'}\nUser: ${targetUser ? targetUser.toString() : 'All'}`,
                                inline: false
                            });
                        }

                        // Add all splits (this might make the embed very long)
                        for (const split of filteredSplits) {
                            const date = split.createdAt || split.timestamp || new Date();
                            const formattedDate = new Date(date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            // Create a cleaner participants list
                            let participantsText = 'No participants';
                            if (split.participants && split.participants.length > 0) {
                                const participantMentions = split.participants.map(id => `<@${id}>`);
                                participantsText = participantMentions.join('\n');
                            }

                            allEmbed.addFields({
                                name: `💰 ${split.splitType} - ${formattedDate}`,
                                value: `**Total Loot:** ${(split.totalLoot || 0).toLocaleString()} silver\n**Tax:** ${(split.taxAmount || 0).toLocaleString()} silver\n**Per Player:** ${(split.payoutPerPlayer || 0).toLocaleString()} silver\n**Participants (${split.participants?.length || 0}):**\n${participantsText}`,
                                inline: false
                            });
                        }

                        allEmbed.setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();

                        await i.update({ embeds: [allEmbed], components: [] });
                    }
                });

                collector.on('end', async () => {
                    // Disable buttons after timeout
                    try {
                        await response.edit({ components: [] });
                    } catch (error) {
                        console.log('Could not disable lootsplit-history buttons:', error.message);
                    }
                });
            }

        } catch (error) {
            console.error('Error in lootsplit-history command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while retrieving loot split history.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
