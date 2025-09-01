const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taxrate')
        .setDescription('Set tax rate for a content type (Admin only)')
        .addStringOption(option =>
            option.setName('content_type')
                .setDescription('The content type to set tax rate for')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('tax_percentage')
                .setDescription('Tax percentage (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100))
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
            console.error('Error in taxrate autocomplete:', error);
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
            } else {
                // Check if user has taxrate permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'taxrate');
                    if (userHasPermission) {
                        hasPermission = true;
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have taxrate permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'taxrate');
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
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or taxrate permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const contentType = interaction.options.getString('content_type');
            const taxPercentage = interaction.options.getInteger('tax_percentage');

            // Check if content type exists
            const contentTypes = await db.getContentTypes(interaction.guildId);
            if (!contentTypes.includes(contentType)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Content Type Not Found')
                    .setDescription(`**${contentType}** is not in your guild's content types.`)
                    .addFields(
                        { name: '📋 Available Content Types', value: contentTypes.length > 0 ? contentTypes.join(', ') : 'None', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Set the tax rate
            const success = await db.setTaxRate(interaction.guildId, contentType, taxPercentage);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Tax Rate Set Successfully!')
                    .setDescription(`Tax rate for **${contentType}** has been set to **${taxPercentage}%**`)
                    .addFields(
                        { name: '🎯 Content Type', value: contentType, inline: true },
                        { name: '💸 Tax Rate', value: `${taxPercentage}%`, inline: true }
                    )
                    .addFields({
                        name: 'ℹ️ Information',
                        value: `This tax rate will be applied to all loot splits for ${contentType} content.`,
                        inline: false
                    })
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Set Tax Rate')
                    .setDescription('Failed to set tax rate. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in taxrate command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while setting the tax rate.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
