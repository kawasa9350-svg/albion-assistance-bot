const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show guild balance leaderboard (15 users per page)'),

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

            // Get all user balances
            const allBalances = await db.getAllUserBalances(interaction.guildId);
            
            if (allBalances.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📊 Leaderboard')
                    .setDescription('No users have balances yet. Users need to register and receive payments to appear on the leaderboard.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Sort users by balance (highest first)
            const sortedUsers = allBalances.sort((a, b) => b.balance - a.balance);
            
            // Calculate total guild balance
            const totalGuildBalance = sortedUsers.reduce((total, user) => total + user.balance, 0);
            
            // Pagination settings
            const usersPerPage = 15;
            const totalPages = Math.ceil(sortedUsers.length / usersPerPage);
            let currentPage = 0;

            // Function to create leaderboard embed
            function createLeaderboardEmbed(page) {
                const startIndex = page * usersPerPage;
                const endIndex = Math.min(startIndex + usersPerPage, sortedUsers.length);
                const pageUsers = sortedUsers.slice(startIndex, endIndex);

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(' Guild Balance Leaderboard')
                    .setDescription(`Showing users ${startIndex + 1}-${endIndex} of ${sortedUsers.length}`)
                    .setFooter({ text: `Page ${page + 1} of ${totalPages} • Phoenix Assistance Bot` })
                    .setTimestamp();

                // Add user entries
                let leaderboardText = '';
                pageUsers.forEach((user, index) => {
                    const rank = startIndex + index + 1;
                    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                    leaderboardText += `${medal} <@${user.userId}> - **${user.balance.toLocaleString()} silver**\n`;
                });

                embed.addFields({
                    name: 'Rankings',
                    value: leaderboardText || 'No users found',
                    inline: false
                });

                // Add total guild balance to footer
                embed.setFooter({ 
                    text: `🏛️ Total Guild Owed: ${totalGuildBalance.toLocaleString()} silver | Page ${currentPage + 1} of ${totalPages}`,
                    iconURL: interaction.guild.iconURL()
                });

                return embed;
            }

            // Function to create navigation row
            function createNavigationRow() {
                const row = new ActionRowBuilder();
                
                if (totalPages > 1) {
                    row.addComponents(
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
                }
                
                return row;
            }

            // Send initial reply
            const initialEmbed = createLeaderboardEmbed(currentPage);
            const initialRow = createNavigationRow();
            
            const response = await interaction.reply({
                embeds: [initialEmbed],
                components: totalPages > 1 ? [initialRow] : [],
                fetchReply: true
            });

            // Only create collector if there are multiple pages
            if (totalPages > 1) {
                const collector = response.createMessageComponentCollector({ time: 300000 }); // 5 minutes

                collector.on('collect', async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: '❌ This leaderboard is not yours to control!', ephemeral: true });
                        return;
                    }

                    switch (i.customId) {
                        case 'first':
                            currentPage = 0;
                            break;
                        case 'prev':
                            currentPage = Math.max(0, currentPage - 1);
                            break;
                        case 'next':
                            currentPage = Math.min(totalPages - 1, currentPage + 1);
                            break;
                        case 'last':
                            currentPage = totalPages - 1;
                            break;
                    }

                    const updatedEmbed = createLeaderboardEmbed(currentPage);
                    const updatedRow = createNavigationRow();

                    await i.update({
                        embeds: [updatedEmbed],
                        components: [updatedRow]
                    });
                });

                collector.on('end', async () => {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
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
                        );

                        await response.edit({ components: [disabledRow] });
                    } catch (error) {
                        console.log('Could not disable leaderboard buttons:', error.message);
                    }
                });
            }
        } catch (error) {
            console.error('Error in leaderboard command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching the leaderboard.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
