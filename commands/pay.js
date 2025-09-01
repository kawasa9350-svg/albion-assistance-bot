const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay silver to another user from your balance')
        .addUserOption(option =>
            option.setName('to_user')
                .setDescription('User to pay silver to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of silver to pay')
                .setRequired(true)
                .setMinValue(1)),

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

            const toUser = interaction.options.getUser('to_user');
            const amount = interaction.options.getInteger('amount');

            // Check if sender is registered
            const senderRegistration = await db.getUserRegistration(interaction.guildId, interaction.user.id);
            if (!senderRegistration) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Not Registered')
                    .setDescription('You must register with the guild first using `/register` before you can make payments.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Check if recipient is registered
            const recipientRegistration = await db.getUserRegistration(interaction.guildId, toUser.id);
            if (!recipientRegistration) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Recipient Not Registered')
                    .setDescription(`${toUser.toString()} is not registered with the guild. They must register first using `/register`.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Check if user is trying to pay themselves
            if (interaction.user.id === toUser.id) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Self-Payment Not Allowed')
                    .setDescription('You cannot pay yourself.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Check if sender has sufficient balance
            const senderBalance = await db.getUserBalance(interaction.guildId, interaction.user.id);
            if (senderBalance < amount) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Insufficient Funds')
                    .setDescription(`You don't have enough silver to make this payment.`)
                    .addFields(
                        { name: '💵 Required Amount', value: `${amount.toLocaleString()} silver`, inline: true },
                        { name: '💰 Your Balance', value: `${senderBalance.toLocaleString()} silver`, inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Process the payment
            const senderSuccess = await db.updateUserBalance(interaction.guildId, interaction.user.id, amount, 'subtract');
            const recipientSuccess = await db.updateUserBalance(interaction.guildId, toUser.id, amount, 'add');

            if (senderSuccess && recipientSuccess) {
                // Send DM to recipient (if enabled)
                const config = require('../config.js');
                if (config.features && config.features.enableDMs) {
                    try {
                        const dmEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('💰 Payment Received!')
                            .setDescription(`You received **${amount.toLocaleString()} silver** from ${interaction.user.toString()}!`)
                            .addFields(
                                { name: '💵 Amount Received', value: `${amount.toLocaleString()} silver`, inline: true },
                                { name: '👤 From', value: interaction.user.toString(), inline: true }
                            )
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                        
                        await toUser.send({ embeds: [dmEmbed] });
                    } catch (error) {
                        console.log(`Could not send DM to user ${toUser.id}:`, error.message);
                    }
                }

                // Create success embed
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Payment Successful!')
                    .setDescription(`**${amount.toLocaleString()} silver** has been transferred to ${toUser.toString()}`)
                    .addFields(
                        { name: '💵 Amount', value: `${amount.toLocaleString()} silver`, inline: true },
                        { name: '👤 From', value: interaction.user.toString(), inline: true },
                        { name: '👤 To', value: toUser.toString(), inline: true }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: false });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Payment Failed')
                    .setDescription('Failed to process the payment. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in pay command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the payment.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
