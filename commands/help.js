const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands and their usage'),

    async execute(interaction) {
        const mainEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎮 Phoenix Assistance Bot - Help')
            .setDescription('Welcome to the Phoenix Assistance Bot! Please select a category below to view available commands.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('help_category')
                    .setPlaceholder('Choose a command category...')
                    .addOptions([
                        {
                            label: '🏗️ Setup Commands',
                            description: 'Guild administration and setup commands',
                            value: 'setup'
                        },
                        {
                            label: '📝 Admin Commands',
                            description: 'Admin-only commands for content and build management',
                            value: 'Admin'
                        },
                        {
                            label: '👥 User Commands',
                            description: 'Commands for all users',
                            value: 'users'
                        }
                    ])
            );

        const response = await interaction.reply({
            embeds: [mainEmbed],
            components: [selectMenu],
            fetchReply: true,
            ephemeral: true
        });

        try {
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.customId === 'help_category') {
                    const category = i.values[0];
                    const categoryEmbed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();

                    switch (category) {
                        case 'setup':
                            categoryEmbed
                                .setTitle('🏗️ Setup Commands')
                                .setDescription('These commands are for guild administrators:')
                                .addFields(
                                    { name: '1. /guild-register [guild_name]', value: 'Register your guild with the bot (Admin only)', inline: false },
                                    { name: '2. /perms-add [role] [command]', value: 'Add permission for a role to use a command (Admin only)', inline: false },
                                    { name: '3. /perms-remove [role] [command]', value: 'Remove permission for a role to use a command (Admin only)', inline: false },
                                    { name: '4. /register-prefix [prefix]', value: 'Set guild prefix for user registrations (Admin only)', inline: false }
                                );
                            break;

                        case 'Admin':
                            categoryEmbed
                                .setTitle('📝 Admin Commands')
                                .setDescription('Manage content types for your guild (Admin only):')
                                .addFields(
                                    { name: '1. /add-content [content]', value: 'Add a new content type (requires permission)', inline: false },
                                    { name: '2. /content-list', value: 'List all available content types', inline: false },
                                    { name: '3. /taxrate [content_type] [tax_percentage]', value: 'Set tax rate for content type (Admin only)', inline: false },
                                    { name: '4. /lootsplit [split_type] [users] [total_loot]', value: 'Create loot split with tax calculations', inline: false },
                                    { name: '5. /paycheck add [users] [amount]', value: 'Add silver to user accounts', inline: false },
                                    { name: '6. /paycheck remove [users] [amount]', value: 'Remove silver from user accounts', inline: false },
                                    { name: '7. /build create [name]', value: 'Create a new build (requires permission)', inline: false },
                                    { name: '8. /build delete', value: 'Delete a build (requires permission)', inline: false },
                                    { name: '9. /build edit', value: 'Edit an existing build (requires permission)', inline: false },
                                    { name: '10. /comp create', value: 'Create a new comp (requires permission)', inline: false },
                                    { name: '11. /comp list', value: 'List all available comps', inline: false },
                                    { name: '12. /comp delete', value: 'Delete a comp (requires permission)', inline: false }
                                );
                            break;


                        case 'users':
                            categoryEmbed
                                .setTitle('👥 User Commands')
                                .setDescription('Commands for all users:')
                                .addFields(
                                    { name: '1. /register [in_game_name]', value: 'Register your in-game name with the guild', inline: false },
                                    { name: '2. /balance [user]', value: 'Check user balance (leave empty for your own)', inline: false },
                                    { name: '3. /pay [user] [amount]', value: 'Pay silver to another user from your balance', inline: false },
                                    { name: '4. /leaderboard', value: 'Show guild balance leaderboard', inline: false },
                                    { name: '5. /build list [content_type] [name]', value: 'List all builds with optional filtering', inline: false },
                                    { name: '6. /comp list', value: 'List all available comps', inline: false },
                                    { name: '7. /event list', value: 'List all available events', inline: false },
                                    { name: '8. /signup', value: 'Create a signup for an event', inline: false }
                                );
                            break;
                    }

                    await i.update({ embeds: [categoryEmbed] });
                }
            });

            collector.on('end', () => {
                // Remove the select menu after timeout
                interaction.editReply({
                    components: [],
                    content: 'Help menu has expired. Use `/help` again if you need assistance.'
                }).catch(() => {});
            });

        } catch (error) {
            console.error('Error in help command:', error);
            await interaction.followUp({
                content: 'An error occurred while setting up the help menu. Please try again.',
                ephemeral: true
            });
        }
    },
};
