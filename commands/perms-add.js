const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perms-add')
        .setDescription('Add permission for a role to use a specific command')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to add permission to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to grant permission for')
                .setRequired(true)
                .addChoices(
                    { name: 'add-content', value: 'add-content' },
                    { name: 'delete-content', value: 'delete-content' },
                    { name: 'build', value: 'build' },
                    { name: 'comp', value: 'comp' },
                    { name: 'content-list', value: 'content-list' },
                    { name: 'register-prefix', value: 'register-prefix' },
                    { name: 'taxrate', value: 'taxrate' },
                    { name: 'lootsplit', value: 'lootsplit' },
                    { name: 'lootsplit-history', value: 'lootsplit-history' },
                    { name: 'paycheck', value: 'paycheck' },
                    { name: 'pay', value: 'pay' },
                    { name: 'balance', value: 'balance' },
                    { name: 'attendance', value: 'attendance' },
                    { name: 'event', value: 'event' },
                    { name: 'regear', value: 'regear' }
                ))
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

            const role = interaction.options.getRole('role');
            const command = interaction.options.getString('command');

            // Add permission
            const success = await db.addPermission(interaction.guildId, role.id, command);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Permission Added Successfully!')
                    .setDescription(`**${role.name}** can now use the **\`/${command}\`** command!`)
                    .addFields(
                        { name: '🎭 Role', value: role.toString(), inline: true },
                        { name: '⚡ Command', value: `\`/${command}\``, inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Add Permission')
                    .setDescription('Failed to add permission. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in perms-add command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while adding permission.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
