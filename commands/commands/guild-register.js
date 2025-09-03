const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild-register')
        .setDescription('Register this guild with the Phoenix Assistance Bot')
        .addStringOption(option =>
            option.setName('guild_name')
                .setDescription('The name of your Albion guild')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, db) {
        try {
            // Check if guild is already registered
            if (await db.isGuildRegistered(interaction.guildId)) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Guild Already Registered')
                    .setDescription('This guild is already registered with the Phoenix Assistance Bot!')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Register the guild
            const guildName = interaction.options.getString('guild_name');
            const success = await db.registerGuild(interaction.guildId, guildName);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Guild Registered Successfully!')
                    .setDescription(`**${guildName}** has been registered with the Phoenix Assistance Bot!`)
                    .addFields(
                        { name: '🎮 Available Commands', value: 'Use `/help` to see all available commands', inline: false },
                        { name: '⚙️ Next Steps', value: 'Set up permissions and add content types to get started!', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Registration Failed')
                    .setDescription('Failed to register guild. Please try again or contact support.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in guild-register command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while registering the guild.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
