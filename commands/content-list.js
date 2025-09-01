const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('content-list')
        .setDescription('List all available content types for this guild'),

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

            // Get content types
            const contentTypes = await db.getContentTypes(interaction.guildId);

            if (contentTypes.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📝 Content Types')
                    .setDescription('No content types have been added yet.')
                    .addFields(
                        { name: '💡 Tip', value: 'Use `/add-content` to add your first content type!', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('📝 Available Content Types')
                    .setDescription(`Your guild has **${contentTypes.length}** content type(s) available:`)
                    .addFields(
                        { 
                            name: '🎯 Content Types', 
                            value: contentTypes.map((type, index) => `${index + 1}. **${type}**`).join('\n'), 
                            inline: false 
                        }
                    )
                    .addFields(
                        { name: '💡 Usage', value: 'Use these content types when creating builds to categorize them properly.', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error in content-list command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching content types.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
