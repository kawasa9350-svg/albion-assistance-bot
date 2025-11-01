const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register-prefix')
        .setDescription('Set the guild prefix for user registrations (Admin only)')
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('The prefix to add before in-game names (e.g., "[Guild]")')
                .setRequired(true)
                .setMaxLength(20))
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
            } else {
                // Check if user has register-prefix permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'register-prefix');
                    if (userHasPermission) {
                        hasPermission = true;
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have register-prefix permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'register-prefix');
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
                    .setDescription('You do not have permission to use this command.\n\n**Required:** Administrator role or register-prefix permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const prefix = interaction.options.getString('prefix');

            // Set the guild prefix
            const success = await db.setGuildPrefix(interaction.guildId, prefix);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Guild Prefix Set Successfully!')
                    .setDescription(`The guild prefix has been set to: **${prefix}**`)
                    .addFields(
                        { name: '🏷️ Prefix', value: prefix, inline: true },
                        { name: '📝 Example', value: `${prefix} PlayerName`, inline: true }
                    )
                    .addFields({
                        name: 'ℹ️ Information',
                        value: 'New users who register will now have this prefix added to their Discord nicknames.',
                        inline: false
                    })
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Set Prefix')
                    .setDescription('Failed to set guild prefix. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in register-prefix command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while setting the guild prefix.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
