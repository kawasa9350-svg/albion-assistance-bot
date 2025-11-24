const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootsplit')
        .setDescription('Create a loot split with tax calculations (Admin only)')
        .addStringOption(option =>
            option.setName('split_type')
                .setDescription('The content type for this loot split')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('users')
                .setDescription('Comma-separated list of user IDs or mentions (@user1, @user2)')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('total_loot')
                .setDescription('Total loot amount in silver')
                .setRequired(true)
                .setMinValue(1))
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
            
            // Check if guild is registered
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                await interaction.respond([]);
                return;
            }

            // Get available content types
            const contentTypes = await db.getContentTypes(interaction.guildId);
            
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
            console.error('Error in lootsplit autocomplete:', error);
            await interaction.respond([]);
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
                console.log(`User ${interaction.user.id} has Administrator permission for lootsplit`);
            } else {
                // Check if user has lootsplit permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'lootsplit');
                    if (userHasPermission) {
                        hasPermission = true;
                        console.log(`User ${interaction.user.id} has direct lootsplit permission`);
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have lootsplit permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'lootsplit');
                            if (roleHasPermission) {
                                hasPermission = true;
                                console.log(`User ${interaction.user.id} has lootsplit permission through role: ${role.name}`);
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
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or lootsplit permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const splitType = interaction.options.getString('split_type');
            const usersInput = interaction.options.getString('users');
            const totalLoot = interaction.options.getInteger('total_loot');

            // Check if content type exists
            const contentTypes = await db.getContentTypes(interaction.guildId);
            if (!contentTypes.includes(splitType)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Content Type Not Found')
                    .setDescription(`**${splitType}** is not in your guild's content types.`)
                    .addFields(
                        { name: '📋 Available Content Types', value: contentTypes.length > 0 ? contentTypes.join(', ') : 'None', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

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

            // Check for @everyone, server owner, and roles - only allow actual users
            const invalidIds = [];
            const validUserIds = [];
            
            for (const userId of userIds) {
                try {
                    // Check if it's @everyone (guild ID)
                    if (userId === interaction.guild.id) {
                        invalidIds.push({ id: userId, reason: '@everyone' });
                        continue;
                    }
                    
                    // Try to fetch the user to verify it's a real user (not a role)
                    const user = await interaction.client.users.fetch(userId);
                    if (!user || user.bot) {
                        invalidIds.push({ id: userId, reason: 'bot or invalid user' });
                        continue;
                    }
                    
                    // Check if user is registered
                    const isRegistered = await db.isUserRegistered(interaction.guildId, userId);
                    if (isRegistered) {
                        validUserIds.push(userId);
                    } else {
                        invalidIds.push({ id: userId, reason: 'not registered' });
                    }
                } catch (error) {
                    console.error(`Error validating user ${userId}:`, error);
                    invalidIds.push({ id: userId, reason: 'invalid user ID' });
                }
            }
            
            if (validUserIds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ No Valid Users')
                    .setDescription('None of the provided users are valid registered users.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            if (invalidIds.length > 0) {
                const invalidList = invalidIds.map(item => `<@${item.id}> (${item.reason})`).join('\n');
                
                // Create confirmation embed with buttons
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Confirm Loot Split')
                    .setDescription(`Some users were invalid and will be excluded:\n${invalidList}\n\n**Valid users who will receive payment:** ${validUserIds.map(id => `<@${id}>`).join(', ')}\n\n**Total participants:** ${validUserIds.length}\n\nDo you want to proceed with only the valid users?`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                const confirmRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_lootsplit')
                            .setLabel('✅ Proceed with Valid Users')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('cancel_lootsplit')
                            .setLabel('❌ Cancel Loot Split')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                const response = await interaction.reply({ 
                    embeds: [confirmEmbed], 
                    components: [confirmRow],
                    ephemeral: true,
                    fetchReply: true
                });
                
                // Create collector for button interactions
                const collector = response.createMessageComponentCollector({ time: 60000 }); // 1 minute timeout
                
                collector.on('collect', async (i) => {
                    if (i.user.id !== interaction.user.id) {
                        await i.reply({ content: '❌ This confirmation is not yours to control!', ephemeral: true });
                        return;
                    }
                    
                    if (i.customId === 'confirm_lootsplit') {
                        // User confirmed, proceed with loot split
                        await i.update({ 
                            embeds: [new EmbedBuilder()
                                .setColor('#00AA00')
                                .setTitle('✅ Proceeding with Loot Split')
                                .setDescription('Processing loot split with valid users only...')
                                .setFooter({ text: 'Phoenix Assistance Bot' })
                                .setTimestamp()],
                            components: []
                        });
                        
                        // Continue with the loot split logic
                        await processLootSplit();
                    } else if (i.customId === 'cancel_lootsplit') {
                        // User cancelled
                        await i.update({ 
                            embeds: [new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('❌ Loot Split Cancelled')
                                .setDescription('Loot split has been cancelled.')
                                .setFooter({ text: 'Phoenix Assistance Bot' })
                                .setTimestamp()],
                            components: []
                        });
                    }
                });
                
                collector.on('end', async () => {
                    // Disable buttons after timeout
                    try {
                        await response.edit({ components: [] });
                    } catch (error) {
                        console.log('Could not disable confirmation buttons:', error.message);
                    }
                });
                
                return; // Stop here and wait for user confirmation
            }
            
            // If no invalid users, proceed directly
            await processLootSplit();
            
            // Function to process the loot split
            async function processLootSplit() {
                // Send initial processing message if this is the direct path
                if (invalidIds.length === 0) {
                    await interaction.reply({ 
                        embeds: [new EmbedBuilder()
                            .setColor('#00AA00')
                            .setTitle('✅ Processing Loot Split')
                            .setDescription('Processing loot split with all valid users...')
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp()],
                        ephemeral: false
                    });
                }
                try {
                    // Get tax rate for this content type, use default 20% if none set
                    let taxRate = await db.getTaxRate(interaction.guildId, splitType);
                    console.log(`Raw tax rate from DB for ${splitType}:`, taxRate, typeof taxRate);
                    if (taxRate === null || taxRate === undefined) {
                        taxRate = 20; // Default 20% tax rate
                        console.log(`Using default tax rate: ${taxRate}%`);
                    } else {
                        console.log(`Using configured tax rate: ${taxRate}%`);
                    }
                    const taxAmount = Math.floor(totalLoot * taxRate / 100);
                    const remainingLoot = totalLoot - taxAmount;
                    const payoutPerPlayer = Math.floor(remainingLoot / validUserIds.length);

                    // Create loot split data
                    const splitData = {
                        splitType: splitType,
                        totalLoot: totalLoot,
                        taxRate: taxRate,
                        taxAmount: taxAmount,
                        payoutPerPlayer: payoutPerPlayer,
                        participants: validUserIds,
                        createdBy: interaction.user.id
                    };

                    // Create the loot split in database
                    const lootSplit = await db.createLootSplit(interaction.guildId, splitData);

                    if (lootSplit) {
                        // Update user balances and send DMs (if enabled)
                        for (const userId of validUserIds) {
                            await db.updateUserBalance(interaction.guildId, userId, payoutPerPlayer, 'add');
                            
                            // Check if DMs are enabled in config
                            const config = require('../config.js');
                            if (config.features && config.features.enableDMs) {
                                // Send DM to user about the loot split
                                try {
                                    const user = await interaction.client.users.fetch(userId);
                                    const dmEmbed = new EmbedBuilder()
                                        .setColor('#00FF00')
                                        .setTitle('💰 Loot Split Payment Received!')
                                        .setDescription(`You received **${payoutPerPlayer.toLocaleString()} silver** from the **${splitType}** loot split!`)
                                        .addFields(
                                            { name: '💵 Amount Received', value: `${payoutPerPlayer.toLocaleString()} silver`, inline: true },
                                            { name: '🎯 Content Type', value: splitType, inline: true },
                                            { name: '👥 Participants', value: validUserIds.length.toString(), inline: true }
                                        )
                                        .setFooter({ text: 'Phoenix Assistance Bot' })
                                        .setTimestamp();
                                    
                                    await user.send({ embeds: [dmEmbed] });
                                } catch (error) {
                                    console.log(`Could not send DM to user ${userId}:`, error.message);
                                }
                            }
                        }

                        // Create the embed
                        const embed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('💰 Loot Split')
                            .addFields(
                                { name: 'Total Loot', value: totalLoot.toLocaleString(), inline: true },
                                { name: 'Guild Split Fee', value: taxAmount.toLocaleString(), inline: true },
                                { name: 'Payout Per Player', value: payoutPerPlayer.toLocaleString(), inline: true }
                            )
                            .addFields(
                                { name: 'User Count', value: validUserIds.length.toString(), inline: true },
                                { name: 'Split Type', value: splitType, inline: true }
                            )
                            .addFields({
                                name: '👤 Users',
                                value: validUserIds.map(id => `<@${id}>`).join('\n'),
                                inline: false
                            })
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();

                        // Use appropriate method based on path
                        if (invalidIds.length === 0) {
                            await interaction.editReply({ embeds: [embed], ephemeral: false });
                        } else {
                            await interaction.followUp({ embeds: [embed], ephemeral: false });
                        }
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Failed to Create Loot Split')
                            .setDescription('Failed to create loot split. Please try again.')
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                        
                        // Use appropriate method based on path
                        if (invalidIds.length === 0) {
                            await interaction.editReply({ embeds: [embed], ephemeral: false });
                        } else {
                            await interaction.followUp({ embeds: [embed], ephemeral: false });
                        }
                    }
                } catch (error) {
                    console.error('Error in processLootSplit:', error);
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while processing the loot split.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    // Use appropriate method based on path
                    if (invalidIds.length === 0) {
                        await interaction.editReply({ embeds: [embed], ephemeral: false });
                    } else {
                        await interaction.followUp({ embeds: [embed], ephemeral: false });
                    }
                }
            }
        } catch (error) {
            console.error('Error in lootsplit command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while creating the loot split.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
