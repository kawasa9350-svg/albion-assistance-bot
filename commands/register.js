const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your in-game name with the guild')
        .addStringOption(option =>
            option.setName('in_game_name')
                .setDescription('Your Albion Online in-game name')
                .setRequired(true)
                .setMaxLength(50)),

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

            // Check if user is already registered
            const existingUser = await db.getUserRegistration(interaction.guildId, interaction.user.id);
            if (existingUser) {
                // User is already registered, update their in-game name
                const oldInGameName = existingUser.inGameName;
                const newInGameName = interaction.options.getString('in_game_name');
                
                            // Check if user should get prefix based on roles (same logic as above)
            const member = interaction.member;
            const config = require('../config.json');
            let shouldApplyPrefix = false; // Default to skip prefix
            
            // Check if user has any roles that require prefix
            if (config.registration && config.registration.prefixRequiredRoles) {
                for (const roleId of config.registration.prefixRequiredRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = true;
                        break;
                    }
                }
            }
            
            // Check if user has any roles that should skip prefix (overrides required)
            if (config.registration && config.registration.skipPrefixForRoles) {
                for (const roleId of config.registration.skipPrefixForRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = false;
                        break;
                    }
                }
            }

                // Update the user's in-game name with prefix control
                const updateResult = await db.updateUserInGameName(interaction.guildId, interaction.user.id, newInGameName, shouldApplyPrefix);
                
                if (updateResult && updateResult.success) {
                    const embed = new EmbedBuilder()
                        .setColor('#00AA00')
                        .setTitle('✅ In-Game Name Updated!')
                        .setDescription(`Your in-game name has been updated from **${oldInGameName}** to **${newInGameName}**`)
                        .addFields(
                            { name: '🔄 Old Name', value: oldInGameName, inline: true },
                            { name: '🆕 New Name', value: newInGameName, inline: true },
                            { name: '👤 Discord User', value: interaction.user.toString(), inline: true }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();

                    // Try to update the user's nickname
                    try {
                        const member = interaction.member;
                        if (member && member.manageable) {
                            await member.setNickname(updateResult.displayName);
                            embed.addFields({
                                name: '✅ Nickname Updated',
                                value: `Your Discord nickname has been updated to: **${updateResult.displayName}**`,
                                inline: false
                            });
                        } else {
                            embed.addFields({
                                name: '⚠️ Manual Nickname Update Required',
                                value: `Your Discord nickname could not be updated automatically due to permission restrictions. Please manually change your nickname to: **${updateResult.displayName}**\n\n**Note:** Your in-game name has been updated in the database.`,
                                inline: false
                            });
                        }
                    } catch (nicknameError) {
                        console.error(`Could not update nickname for user ${interaction.user.id}:`, nicknameError.message);
                        embed.addFields({
                            name: '⚠️ Manual Nickname Update Required',
                            value: `Your Discord nickname could not be updated automatically. Please manually change your nickname to: **${updateResult.displayName}**\n\n**Note:** Your in-game name has been updated in the database.`,
                            inline: false
                        });
                    }

                    await interaction.reply({ embeds: [embed], ephemeral: false });
                    return;
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Update Failed')
                        .setDescription('Failed to update your in-game name. Please try again or contact support.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }
            }

            const inGameName = interaction.options.getString('in_game_name');

            // Check if user should get prefix based on roles
            const member = interaction.member;
            const config = require('../config.json');
            let shouldApplyPrefix = false; // Default to skip prefix
            
            // Check if user has any roles that require prefix
            if (config.registration && config.registration.prefixRequiredRoles) {
                for (const roleId of config.registration.prefixRequiredRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = true;
                        break;
                    }
                }
            }
            
            // Check if user has any roles that should skip prefix (overrides required)
            if (config.registration && config.registration.skipPrefixForRoles) {
                for (const roleId of config.registration.skipPrefixForRoles) {
                    if (member.roles.cache.has(roleId)) {
                        shouldApplyPrefix = false;
                        break;
                    }
                }
            }

            // Register the user with prefix control
            const result = await db.registerUser(interaction.guildId, interaction.user.id, inGameName, shouldApplyPrefix);

            if (result && result.success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Registration Successful!')
                    .setDescription(`You have been registered with the in-game name: **${inGameName}**`)
                    .addFields(
                        { name: '🎮 In-Game Name', value: inGameName, inline: true },
                        { name: '👤 Discord User', value: interaction.user.toString(), inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                // Try to update the user's nickname
                try {
                    const member = interaction.member;
                    if (member && member.manageable) {
                        await member.setNickname(result.displayName);
                        embed.addFields({
                            name: '✅ Nickname Updated',
                            value: `Your Discord nickname has been updated to: **${result.displayName}**`,
                            inline: false
                        });
                    } else {
                        embed.addFields({
                            name: '⚠️ Manual Nickname Update Required',
                            value: `Your Discord nickname could not be updated automatically due to permission restrictions. Please manually change your nickname to: **${result.displayName}**\n\n**Note:** You are still registered in the database and can use all bot features.`,
                            inline: false
                        });
                    }
                } catch (nicknameError) {
                    console.error(`Could not update nickname for user ${interaction.user.id}:`, nicknameError.message);
                    embed.addFields({
                        name: '⚠️ Manual Nickname Update Required',
                        value: `Your Discord nickname could not be updated automatically. Please manually change your nickname to: **${result.displayName}**\n\n**Note:** You are still registered in the database and can use all bot features.`,
                        inline: false
                    });
                }

                await interaction.reply({ embeds: [embed], ephemeral: false });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Registration Failed')
                    .setDescription('Failed to register user. Please try again or contact support.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in register command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while registering the user.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
