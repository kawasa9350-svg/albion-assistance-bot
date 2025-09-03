const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show guild leaderboards (balance or attendance)'),

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

            // Start with balance leaderboard by default
            await this.showLeaderboard(interaction, db, 'balance');
        } catch (error) {
            console.error('Error in leaderboard command:', error);
            
            // Only try to reply if we haven't already replied and the interaction is still valid
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while fetching the leaderboard.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        }
    },

    async showLeaderboard(interaction, db, type = 'balance') {
        try {
            let data, title, description, totalField, emptyMessage;
            
            if (type === 'balance') {
                data = await db.getAllUserBalances(interaction.guildId);
                title = '💰 Guild Balance Leaderboard';
                description = 'Top earners in the guild';
                totalField = 'Total Guild Owed';
                emptyMessage = 'No users have balances yet. Users need to register and receive payments to appear on the leaderboard.';
            } else {
                data = await db.getAllUserAttendance(interaction.guildId);
                title = '📊 Guild Attendance Leaderboard';
                description = 'Top attendance performers in the guild';
                totalField = 'Total Attendance Points';
                emptyMessage = 'No attendance data found. Use `/attendance add` to start tracking attendance.';
            }
            
            if (data.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle(title)
                    .setDescription(emptyMessage)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Sort users (highest first)
            let sortedUsers = data.sort((a, b) => {
                const aValue = type === 'balance' ? a.balance : a.attendance;
                const bValue = type === 'balance' ? b.balance : b.attendance;
                return bValue - aValue;
            });
            
            // Calculate total
            let total = sortedUsers.reduce((sum, user) => {
                const value = type === 'balance' ? user.balance : user.attendance;
                return sum + value;
            }, 0);
            
            // Pagination settings
            const usersPerPage = 15;
            let totalPages = Math.ceil(sortedUsers.length / usersPerPage);
            let currentPage = 0;

            // Function to create leaderboard embed
            const createLeaderboardEmbed = (page) => {
                const startIndex = page * usersPerPage;
                const endIndex = Math.min(startIndex + usersPerPage, sortedUsers.length);
                const pageUsers = sortedUsers.slice(startIndex, endIndex);

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(title)
                    .setDescription(`Showing users ${startIndex + 1}-${endIndex} of ${sortedUsers.length}`)
                    .setFooter({ text: `Page ${page + 1} of ${totalPages} • Phoenix Assistance Bot` })
                    .setTimestamp();

                // Add user entries
                let leaderboardText = '';
                pageUsers.forEach((user, index) => {
                    const rank = startIndex + index + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                    const value = type === 'balance' ? user.balance : user.attendance;
                    const displayValue = type === 'balance' ? `${value.toLocaleString()} silver` : `${value} points`;
                    leaderboardText += `${medal} <@${user.userId}> - **${displayValue}**\n`;
                });

                embed.addFields({
                    name: 'Rankings',
                    value: leaderboardText || 'No users found',
                    inline: false
                });

                // Add total to footer
                const totalDisplay = type === 'balance' ? `${total.toLocaleString()} silver` : `${total} points`;
                embed.setFooter({ 
                    text: `🏛️ ${totalField}: ${totalDisplay} | Page ${currentPage + 1} of ${totalPages}`,
                    iconURL: interaction.guild.iconURL()
                });

                return embed;
            };

            // Function to create navigation and type selection rows
            const createNavigationRows = () => {
                const rows = [];
                
                // Type selection row
                const typeRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('leaderboard_balance')
                            .setLabel('💰 Balance')
                            .setStyle(type === 'balance' ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('leaderboard_attendance')
                            .setLabel('📊 Attendance')
                            .setStyle(type === 'attendance' ? ButtonStyle.Success : ButtonStyle.Secondary)
                    );
                
                rows.push(typeRow);
                
                // Pagination row (only if multiple pages)
                if (totalPages > 1) {
                    const paginationRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('first')
                                .setLabel('⏮️ First')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === 0),
                            new ButtonBuilder()
                                .setCustomId('prev')
                                .setLabel('◀️ Previous')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(currentPage === 0),
                            new ButtonBuilder()
                                .setCustomId('next')
                                .setLabel('Next ▶️')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(currentPage === totalPages - 1),
                            new ButtonBuilder()
                                .setCustomId('last')
                                .setLabel('Last ⏭️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === totalPages - 1)
                        );
                    
                    rows.push(paginationRow);
                }
                
                return rows;
            };

            // Send initial reply
            const initialEmbed = createLeaderboardEmbed(currentPage);
            const initialRows = createNavigationRows();
            
            const response = await interaction.reply({
                embeds: [initialEmbed],
                components: initialRows,
                fetchReply: true
            });

            // Create collector for interactions
            const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 minutes

            collector.on('collect', async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: '❌ This leaderboard is not yours to control!', ephemeral: true });
                        return;
                    }

                    let shouldUpdate = false;

                    // Handle type switching
                    if (i.customId === 'leaderboard_balance' && type !== 'balance') {
                        type = 'balance';
                        currentPage = 0;
                        shouldUpdate = true;
                    } else if (i.customId === 'leaderboard_attendance' && type !== 'attendance') {
                        type = 'attendance';
                        currentPage = 0;
                        shouldUpdate = true;
                    }
                    // Handle pagination
                    else if (i.customId === 'first') {
                        currentPage = 0;
                        shouldUpdate = true;
                    } else if (i.customId === 'prev') {
                        currentPage = Math.max(0, currentPage - 1);
                        shouldUpdate = true;
                    } else if (i.customId === 'next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                        shouldUpdate = true;
                    } else if (i.customId === 'last') {
                        currentPage = totalPages - 1;
                        shouldUpdate = true;
                    }

                    if (shouldUpdate) {
                        // Re-fetch data if type changed
                        if (i.customId === 'leaderboard_balance' || i.customId === 'leaderboard_attendance') {
                            // Re-fetch data for the new type
                            let newData;
                            if (type === 'balance') {
                                newData = await db.getAllUserBalances(interaction.guildId);
                            } else {
                                newData = await db.getAllUserAttendance(interaction.guildId);
                            }
                            
                            // Update the data and reset pagination
                            data = newData;
                            currentPage = 0;
                            
                            // Sort users (highest first) - Update the existing sortedUsers variable
                            sortedUsers = data.sort((a, b) => {
                                const aValue = type === 'balance' ? a.balance : a.attendance;
                                const bValue = type === 'balance' ? b.balance : b.attendance;
                                return bValue - aValue;
                            });
                            
                            // Calculate total - Update the existing total variable
                            total = sortedUsers.reduce((sum, user) => {
                                const value = type === 'balance' ? user.balance : user.attendance;
                                return sum + value;
                            }, 0);
                            
                            // Update pagination settings - Update the existing totalPages variable
                            totalPages = Math.ceil(sortedUsers.length / usersPerPage);
                            
                            // Create new embed and rows
                            const updatedEmbed = createLeaderboardEmbed(currentPage);
                            const updatedRows = createNavigationRows();

                            await i.update({
                                embeds: [updatedEmbed],
                                components: updatedRows
                            });
                            return;
                        }

                        const updatedEmbed = createLeaderboardEmbed(currentPage);
                        const updatedRows = createNavigationRows();

                        await i.update({
                            embeds: [updatedEmbed],
                            components: updatedRows
                        });
                    }
                } catch (error) {
                    console.error('Error in leaderboard collector:', error);
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({ content: '❌ An error occurred while processing your interaction.', ephemeral: true });
                        }
                    } catch (replyError) {
                        console.error('Error sending collector error message:', replyError);
                    }
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledRows = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('leaderboard_balance')
                                .setLabel('💰 Balance')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('leaderboard_attendance')
                                .setLabel('📊 Attendance')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        )
                    ];

                    if (totalPages > 1) {
                        disabledRows.push(
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('first')
                                    .setLabel('⏮️ First')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('prev')
                                    .setLabel('◀️ Previous')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('next')
                                    .setLabel('Next ▶️')
                                    .setStyle(ButtonStyle.Primary)
                                    .setDisabled(true),
                                new ButtonBuilder()
                                    .setCustomId('last')
                                    .setLabel('Last ⏭️')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            )
                        );
                    }

                    await response.edit({ components: disabledRows });
                } catch (error) {
                    console.log('Could not disable leaderboard buttons:', error.message);
                }
            });
        } catch (error) {
            console.error('Error in showLeaderboard:', error);
            
            // Only try to reply if we haven't already replied and the interaction is still valid
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while fetching the leaderboard.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        }
    },

    async handleButtonInteraction(interaction, db) {
        try {
            // Check if interaction has already been acknowledged
            if (interaction.replied || interaction.deferred) {
                console.log('Leaderboard interaction already acknowledged, skipping...');
                return;
            }

            // This method should not be called for leaderboard buttons anymore
            // as they are handled by the collector in showLeaderboard
            console.log('Leaderboard button interaction handled by collector, no action needed');
        } catch (error) {
            console.error('Error in leaderboard button interaction:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your interaction. Please try again.',
                        ephemeral: true
                    });
                } else {
                    await interaction.followUp({
                        content: '❌ An error occurred while processing your interaction. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }
};
