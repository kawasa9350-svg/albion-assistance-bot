const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-content')
        .setDescription('Delete a content type from the guild database')
        .addStringOption(option =>
            option.setName('content')
                .setDescription('The content type to delete')
                .setRequired(true)
                .setAutocomplete(true)),

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
            // Don't try to respond if interaction is unknown/expired (error 10062)
            // This is expected when interactions expire after 3 seconds
            if (error.code === 10062) {
                console.warn('Autocomplete interaction expired or unknown, skipping response');
                return;
            }
            // For other errors, log them as errors
            console.error('Error in delete-content autocomplete:', error);
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
                    .setDescription('This guild must be registered first. Use `/register` to get started.')
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
                console.log(`User ${interaction.user.id} has Administrator permission for delete-content`);
            } else {
                // Check if user has delete-content permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'delete-content');
                    if (userHasPermission) {
                        hasPermission = true;
                        console.log(`User ${interaction.user.id} has direct delete-content permission`);
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have delete-content permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'delete-content');
                            if (roleHasPermission) {
                                hasPermission = true;
                                console.log(`User ${interaction.user.id} has delete-content permission through role: ${role.name}`);
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
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or delete-content permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const contentType = interaction.options.getString('content');

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

            // Check if content type is being used by any builds
            const buildsUsingContentType = await db.getBuilds(interaction.guildId, contentType, null);
            if (buildsUsingContentType.length > 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Content Type in Use')
                    .setDescription(`**${contentType}** cannot be deleted because it's being used by ${buildsUsingContentType.length} build(s).`)
                    .addFields(
                        { name: '🔗 Builds Using This Type', value: buildsUsingContentType.map(build => `• ${build.name}`).join('\n'), inline: false },
                        { name: '💡 Solution', value: 'Delete or update the builds first, then try deleting the content type again.', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Delete content type
            const success = await db.deleteContentType(interaction.guildId, contentType);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Content Type Deleted Successfully!')
                    .setDescription(`**${contentType}** has been removed from your guild's content types!`)
                    .addFields(
                        { name: '🗑️ Deleted Content Type', value: contentType, inline: true },
                        { name: '📊 Remaining Types', value: (await db.getContentTypes(interaction.guildId)).join(', ') || 'None', inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Delete Content Type')
                    .setDescription('Failed to delete content type. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in delete-content command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while deleting content type.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
