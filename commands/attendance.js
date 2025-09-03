const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attendance')
        .setDescription('Manage attendance tracking for content')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add 1 attendance point to all registered users'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wipe')
                .setDescription('Clear all attendance points for all users'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check attendance for a specific user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to check attendance for (leave empty for your own)')
                        .setRequired(false)))


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

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add':
                    await this.handleAddAttendance(interaction, db);
                    break;
                case 'wipe':
                    await this.handleWipeAttendance(interaction, db);
                    break;
                case 'check':
                    await this.handleCheckAttendance(interaction, db);
                    break;
                default:
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Unknown subcommand!', ephemeral: true });
                    }
            }
        } catch (error) {
            console.error('Error in attendance command:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while processing the attendance command.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        }
    },

    async handleAddAttendance(interaction, db) {
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission`);
        } else {
            // Check if user has attendance permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'attendance');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct attendance permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have attendance permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'attendance');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has attendance permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to add attendance.\n\n**Required:** Administrator role or attendance permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check if the user is in a voice channel
        if (!member.voice.channel) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Not in Voice Channel')
                .setDescription('You must be in a voice channel to add attendance points.\n\nOnly users in the same voice channel as you will receive attendance points.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get all users in the same voice channel
        const voiceChannel = member.voice.channel;
        const voiceChannelMembers = voiceChannel.members.filter(member => !member.user.bot);
        const userIds = voiceChannelMembers.map(member => member.id);

        if (userIds.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('⚠️ No Users in Voice Channel')
                .setDescription('There are no users in your voice channel to give attendance points to.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Add attendance to users in voice channel
        const result = await db.addAttendanceToUsers(interaction.guildId, userIds);

        if (result.success) {
            // Get user names for display
            const userNames = result.userIds.map(userId => {
                const member = voiceChannelMembers.get(userId);
                return member ? member.displayName : `User ${userId}`;
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Attendance Added Successfully!')
                .setDescription(`Added 1 attendance point to **${result.userCount}** registered users in voice channel.`)
                .addFields(
                    { name: '📊 Users Affected', value: result.userCount.toString(), inline: true },
                    { name: '🎤 Voice Channel', value: voiceChannel.name, inline: true },
                    { name: '📅 Date', value: new Date().toLocaleDateString(), inline: true },
                    { name: '👥 Users', value: userNames.join(', '), inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Voice channel attendance tracking' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Failed to Add Attendance')
                .setDescription(result.error || 'Failed to add attendance. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleWipeAttendance(interaction, db) {
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission`);
        } else {
            // Check if user has attendance permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'attendance');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct attendance permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have attendance permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'attendance');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has attendance permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to wipe attendance.\n\n**Required:** Administrator role or attendance permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('⚠️ Confirm Attendance Wipe')
            .setDescription('Are you sure you want to **clear all attendance points** for all users?\n\nThis action **cannot be undone**!')
            .addFields(
                { name: '⚠️ Warning', value: 'This will reset all attendance tracking to 0 for every registered user.', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Confirmation required' })
            .setTimestamp();

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_wipe_attendance')
                    .setLabel('🗑️ Yes, Wipe All Attendance')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_wipe_attendance')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({ 
            embeds: [confirmEmbed], 
            components: [confirmRow],
            ephemeral: true 
        });
    },

    async handleCheckAttendance(interaction, db) {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Check if target user is registered
        const userRegistration = await db.getUserRegistration(interaction.guildId, targetUser.id);
        if (!userRegistration) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('⚠️ User Not Registered')
                .setDescription(`${targetUser.toString()} is not registered with the guild.`)
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get user attendance
        const attendance = await db.getUserAttendance(interaction.guildId, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📊 Attendance Check')
            .setDescription(`${targetUser.toString()}'s attendance information`)
            .addFields(
                { name: '👤 User', value: targetUser.toString(), inline: true },
                { name: '🎮 In-Game Name', value: userRegistration.inGameName, inline: true },
                { name: '📈 Attendance Points', value: attendance.toString(), inline: true }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Attendance tracking' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },



    async handleButtonInteraction(interaction, db) {
        try {
            if (interaction.customId === 'confirm_wipe_attendance') {
                // Perform the attendance wipe
                const result = await db.wipeAllAttendance(interaction.guildId);

                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Attendance Wiped Successfully!')
                        .setDescription(`Cleared attendance points for **${result.userCount}** registered users.`)
                        .addFields(
                            { name: '📊 Users Affected', value: result.userCount.toString(), inline: true },
                            { name: '📅 Date', value: new Date().toLocaleDateString(), inline: true }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot • Attendance tracking' })
                        .setTimestamp();
                    
                    await interaction.update({ embeds: [embed], components: [] });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Failed to Wipe Attendance')
                        .setDescription(result.error || 'Failed to wipe attendance. Please try again.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.update({ embeds: [embed], components: [] });
                }
            } else if (interaction.customId === 'cancel_wipe_attendance') {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('❌ Attendance Wipe Cancelled')
                    .setDescription('Attendance wipe has been cancelled. No changes were made.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.update({ embeds: [embed], components: [] });
            }
        } catch (error) {
            console.error('Error in attendance button interaction:', error);
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
