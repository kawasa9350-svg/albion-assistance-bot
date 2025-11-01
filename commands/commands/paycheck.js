const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('paycheck')
        .setDescription('Manage user balances (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add silver to user accounts')
                .addStringOption(option =>
                    option.setName('users')
                        .setDescription('Comma-separated list of user mentions (@user1, @user2)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of silver to add')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove silver from user accounts')
                .addStringOption(option =>
                    option.setName('users')
                        .setDescription('Comma-separated list of user mentions (@user1, @user2)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of silver to remove')
                        .setRequired(true)
                        .setMinValue(1)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
                console.log(`User ${interaction.user.id} has Administrator permission for paycheck`);
            } else {
                // Check if user has paycheck permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'paycheck');
                    if (userHasPermission) {
                        hasPermission = true;
                        console.log(`User ${interaction.user.id} has direct paycheck permission`);
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have paycheck permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'paycheck');
                            if (roleHasPermission) {
                                hasPermission = true;
                                console.log(`User ${interaction.user.id} has paycheck permission through role: ${role.name}`);
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
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or paycheck permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();
            const usersInput = interaction.options.getString('users');
            const amount = interaction.options.getInteger('amount');

            // Parse users input
            const userMentions = usersInput.match(/<@!?(\d+)>/g);
            const userIds = [];
            
            if (userMentions) {
                userMentions.forEach(mention => {
                    const userId = mention.replace(/<@!?(\d+)>/, '$1');
                    userIds.push(userId);
                });
            } else {
                // Try to parse as comma-separated user IDs
                const ids = usersInput.split(',').map(id => id.trim());
                userIds.push(...ids);
            }

            if (userIds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Invalid Users Input')
                    .setDescription('Please provide valid user mentions (@user1, @user2) or user IDs.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            let operation, operationText, color;
            if (subcommand === 'add') {
                operation = 'add';
                operationText = 'added to';
                color = '#00FF00';
            } else {
                operation = 'subtract';
                operationText = 'removed from';
                color = '#FF0000'; // Changed to red for remove operations
            }

            // Update user balances and send DMs
            const updatedUsers = [];
            const failedUsers = [];
            const insufficientFundsUsers = [];

            for (const userId of userIds) {
                try {
                    // For remove operation, check if user has sufficient balance
                    if (subcommand === 'remove') {
                        const currentBalance = await db.getUserBalance(interaction.guildId, userId);
                        if (currentBalance < amount) {
                            insufficientFundsUsers.push({ id: userId, balance: currentBalance });
                            continue;
                        }
                    }

                    const success = await db.updateUserBalance(interaction.guildId, userId, amount, operation);
                    if (success) {
                        updatedUsers.push(userId);
                        
                        // Send DM to user about the balance change (if enabled)
                        const config = require('../config.js');
                        if (config.features && config.features.enableDMs) {
                            try {
                                const user = await interaction.client.users.fetch(userId);
                                const dmEmbed = new EmbedBuilder()
                                    .setColor(color)
                                    .setTitle(`💰 Balance ${subcommand === 'add' ? 'Added' : 'Removed'}`)
                                    .setDescription(`Your balance has been ${subcommand === 'add' ? 'increased' : 'decreased'} by **${amount.toLocaleString()} silver**!`)
                                    .addFields(
                                        { name: '💵 Amount', value: `${amount.toLocaleString()} silver`, inline: true },
                                        { name: '🎯 Operation', value: subcommand === 'add' ? 'Added' : 'Removed', inline: true },
                                        { name: '👤 By', value: interaction.user.toString(), inline: true }
                                    )
                                    .setFooter({ text: 'Phoenix Assistance Bot' })
                                    .setTimestamp();
                                
                                await user.send({ embeds: [dmEmbed] });
                            } catch (error) {
                                console.log(`Could not send DM to user ${userId}:`, error.message);
                            }
                        }
                    } else {
                        failedUsers.push(userId);
                    }
                } catch (error) {
                    console.error(`Failed to update balance for user ${userId}:`, error);
                    failedUsers.push(userId);
                }
            }

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`💰 Paycheck ${subcommand === 'add' ? 'Added' : 'Removed'}`)
                .setDescription(`${amount.toLocaleString()} silver has been ${operationText} **${updatedUsers.length}** user(s)!`)
                .addFields(
                    { name: '💵 Amount', value: `${amount.toLocaleString()} silver`, inline: true },
                    { name: '👥 Users Affected', value: updatedUsers.length.toString(), inline: true },
                    { name: '🎯 Operation', value: subcommand === 'add' ? 'Add' : 'Remove', inline: true }
                );

            if (updatedUsers.length > 0) {
                embed.addFields({
                    name: '✅ Successfully Updated',
                    value: updatedUsers.map(id => `<@${id}>`).join('\n'),
                    inline: false
                });
            }

            if (failedUsers.length > 0) {
                embed.addFields({
                    name: '❌ Failed to Update',
                    value: failedUsers.map(id => `<@${id}>`).join('\n'),
                    inline: false
                });
            }

            if (insufficientFundsUsers.length > 0) {
                embed.addFields({
                    name: '🚨 INSUFFICIENT FUNDS - NO SILVER REMOVED',
                    value: insufficientFundsUsers.map(user => `<@${user.id}> (Balance: ${user.balance.toLocaleString()} silver)`).join('\n'),
                    inline: false
                });
            }

            embed.setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in paycheck command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the paycheck.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
