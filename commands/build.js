const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('Manage Albion Online builds')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new build interactively')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('The name of the build')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a build interactively'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List builds interactively')),

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

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'create':
                    await this.handleInteractiveCreate(interaction, db);
                    break;
                case 'delete':
                    await this.handleDelete(interaction, db);
                    break;
                case 'list':
                    await this.handleList(interaction, db);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown subcommand!', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in build command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the build command.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleInteractiveCreate(interaction, db) {
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission`);
        } else {
            // Check if user has build permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'build');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct build permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have build permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'build');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has build permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to create builds.\n\n**Required:** Administrator role or build permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get the build name from the command
        const buildName = interaction.options.getString('name');
        
        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types:', contentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('content_type_select')
            .setPlaceholder('Select content type (optional)')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('General purpose build')
                    .setValue('General')
                    .setEmoji('📄'),
                ...contentTypes.map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Build for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        // If no custom content types exist, show a helpful message
        if (contentTypes.length === 0) {
            contentTypeSelect.setPlaceholder('No content types added yet - select General');
        }

        // Store build data in the interaction
        const buildData = {
            name: buildName,
            weapon: '',
            offhand: '',
            cape: '',
            head: '',
            chest: '',
            shoes: '',
            food: '',
            potion: '',
            contentType: 'General'
        };

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('⚔️ Build Creation')
            .setDescription(`**Build Name: ${buildName}**\n\nAll other fields are optional and can be filled in later using \`/build-edit\`.\n\nClick the buttons below to fill in each field for your build. Each button will open a modal where you can type your answer.`)
            .addFields(
                { name: '📝 Build Progress', value: this.generateProgressText(buildData), inline: false },
                { name: '💡 Tip', value: 'You can create a build with just a name and add equipment details later!', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Name provided • Use /build-edit to update later' })
            .setTimestamp();

        // Create buttons for each build component
        const buildButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('weapon')
                    .setLabel('⚔️ Weapon')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('offhand')
                    .setLabel('🛡️ Offhand')
                    .setStyle(ButtonStyle.Primary)
            );

        const armorButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('cape')
                    .setLabel('🧣 Cape')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('head')
                    .setLabel('👑 Head')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('chest')
                    .setLabel('🥋 Chest')
                    .setStyle(ButtonStyle.Primary)
            );

        const consumableButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('shoes')
                    .setLabel('👟 Shoes')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('food')
                    .setLabel('🍗 Food')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('potion')
                    .setLabel('🧪 Potion')
                    .setStyle(ButtonStyle.Primary)
            );

        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_build')
                    .setLabel('✅ Create Build')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_build')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

        // Store the build data temporarily (in a real implementation, you'd use a database or cache)
        interaction.client.buildData = interaction.client.buildData || new Map();
        interaction.client.buildData.set(interaction.user.id, buildData);

        await interaction.reply({
            embeds: [embed],
            components: [buildButtons, armorButtons, consumableButtons, contentTypeRow, actionButtons],
            ephemeral: true
        });
    },

    async handleButtonInteraction(interaction, db) {
        try {
            // Check if this is a list-related interaction
            if (interaction.customId === 'list_name_filter' || 
                (interaction.isStringSelectMenu() && interaction.customId === 'list_content_type_select')) {
                console.log('List interaction detected, routing to list handler');
                return await this.handleListInteraction(interaction, db);
            }

            const userId = interaction.user.id;
            const buildData = interaction.client.buildData?.get(userId) || {};

            console.log(`Build interaction: ${interaction.customId} by user ${userId}`);
            console.log('Current build data:', buildData);

            // Handle select menu interactions
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'content_type_select') {
                    console.log('Content type selected:', interaction.values[0]);
                    buildData.contentType = interaction.values[0];
                    interaction.client.buildData.set(userId, buildData);

                    // Create a new embed with updated progress
                    const embed = new EmbedBuilder()
                        .setColor('#0099FF')
                        .setTitle('⚔️ Build Creation')
                        .setDescription('Click the buttons below to fill in each field for your build. Each button will open a modal where you can type your answer.')
                        .addFields(
                            { name: '📝 Build Progress', value: this.generateProgressText(buildData), inline: false }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot • Click buttons to fill fields' })
                        .setTimestamp();

                    // Update the original message with new progress
                    try {
                        await interaction.update({
                            embeds: [embed],
                            components: interaction.message.components
                        });
                        console.log('Message updated successfully with new content type');
                    } catch (error) {
                        console.error('Error updating message:', error);
                        // Fallback: send a new message
                        await interaction.followUp({
                            content: `✅ Updated Content Type: ${buildData.contentType}`,
                            ephemeral: true
                        });
                    }
                    return;
                } else if (interaction.customId === 'list_content_type_select') {
                    console.log('List content type selected, routing to list handler');
                    return await this.handleListInteraction(interaction, db);
                }
            }

            // Handle button interactions
            switch (interaction.customId) {
                case 'weapon':
                    console.log('Opening weapon modal...');
                    await this.showModal(interaction, 'weapon', 'Weapon', 'Enter main weapon:', buildData.weapon);
                    break;
                case 'offhand':
                    console.log('Opening offhand modal...');
                    await this.showModal(interaction, 'offhand', 'Offhand', 'Enter offhand (optional):', buildData.offhand);
                    break;
                case 'cape':
                    console.log('Opening cape modal...');
                    await this.showModal(interaction, 'cape', 'Cape', 'Enter cape item:', buildData.cape);
                    break;
                case 'head':
                    console.log('Opening head modal...');
                    await this.showModal(interaction, 'head', 'Head', 'Enter head piece:', buildData.head);
                    break;
                case 'chest':
                    console.log('Opening chest modal...');
                    await this.showModal(interaction, 'chest', 'Chest', 'Enter chest piece:', buildData.chest);
                    break;
                case 'shoes':
                    console.log('Opening shoes modal...');
                    await this.showModal(interaction, 'shoes', 'Shoes', 'Enter shoes:', buildData.shoes);
                    break;
                case 'food':
                    console.log('Opening food modal...');
                    await this.showModal(interaction, 'food', 'Food', 'Enter food item:', buildData.food);
                    break;
                case 'potion':
                    console.log('Opening potion modal...');
                    await this.showModal(interaction, 'potion', 'Potion', 'Enter potion item:', buildData.potion);
                    break;
                case 'create_build':
                    console.log('Finalizing build...');
                    await this.finalizeBuild(interaction, db, buildData);
                    break;
                case 'cancel_build':
                    console.log('Cancelling build...');
                    await this.cancelBuild(interaction);
                    break;
                default:
                    console.log(`Unknown interaction: ${interaction.customId}`);
            }
        } catch (error) {
            console.error('Error in handleButtonInteraction:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your interaction. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async showModal(interaction, field, title, label, currentValue) {
        const modal = new ModalBuilder()
            .setCustomId(`modal_${field}`)
            .setTitle(`${title} - ${interaction.message.embeds[0].title}`);

        const input = new TextInputBuilder()
            .setCustomId(`input_${field}`)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setValue(currentValue || '')
            .setRequired(field === 'name') // Only name is required
            .setMaxLength(100);

        const actionRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction, db) {
        try {
            const userId = interaction.user.id;
            const buildData = interaction.client.buildData?.get(userId) || {};
            
            // Extract the field name from the modal custom ID
            const field = interaction.customId.replace('modal_', '');
            const value = interaction.fields.getTextInputValue(`input_${field}`);

            console.log(`Modal submitted - Field: ${field}, Value: ${value}, User: ${userId}`);
            console.log('Current build data before update:', buildData);
            console.log('Modal customId:', interaction.customId);
            console.log('Input customId:', `input_${field}`);

            // Update the build data
            buildData[field] = value;
            interaction.client.buildData.set(userId, buildData);

            console.log('Updated build data:', buildData);

            // Create a new embed with updated progress
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('⚔️ Build Creation')
                .setDescription('Click the buttons below to fill in each field for your build. Each button will open a modal where you can type your answer.')
                .addFields(
                    { name: '📝 Build Progress', value: this.generateProgressText(buildData), inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Click buttons to fill fields' })
                .setTimestamp();

            // Update the original message with new progress
            try {
                await interaction.update({
                    embeds: [embed],
                    components: interaction.message.components
                });
                console.log('Message updated successfully');
            } catch (error) {
                console.error('Error updating message:', error);
                // Fallback: send a new message
                await interaction.followUp({
                    content: `✅ Updated ${field}: ${value}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in handleModalSubmit:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your input. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    generateProgressText(buildData) {
        const fields = [
            { name: 'Build Name', key: 'name', emoji: '📝', required: true },
            { name: 'Weapon', key: 'weapon', emoji: '⚔️', required: false },
            { name: 'Offhand', key: 'offhand', emoji: '🛡️', required: false },
            { name: 'Cape', key: 'cape', emoji: '🧣', required: false },
            { name: 'Head', key: 'head', emoji: '👑', required: false },
            { name: 'Chest', key: 'chest', emoji: '🥋', required: false },
            { name: 'Shoes', key: 'shoes', emoji: '👟', required: false },
            { name: 'Food', key: 'food', emoji: '🍗', required: false },
            { name: 'Potion', key: 'potion', emoji: '🧪', required: false },
            { name: 'Content Type', key: 'contentType', emoji: '📄', required: false }
        ];

        return fields.map(field => {
            const value = buildData[field.key];
            if (field.required) {
                const status = value ? '✅' : '❌';
                const displayValue = value || 'Required - Not set';
                return `${status} ${field.emoji} ${field.name}: ${displayValue}`;
            } else {
                const status = value ? '✅' : '⚪';
                const displayValue = value || 'Optional - Not set';
                return `${status} ${field.emoji} ${field.name}: ${displayValue}`;
            }
        }).join('\n');
    },

    async finalizeBuild(interaction, db, buildData) {
        try {
            const userId = interaction.user.id;
            console.log(`Finalizing build for user ${userId}`);
            console.log('Build data to finalize:', buildData);
            
            // Name is already provided via command, so no need to check

            // Add metadata
            buildData.offhand = buildData.offhand || 'None';
            buildData.contentType = buildData.contentType || 'General';
            buildData.createdBy = interaction.user.id;
            buildData.createdAt = new Date();

            console.log('Final build data with metadata:', buildData);

            // Save to database
            const success = await db.addBuild(interaction.guildId, buildData);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Build Created Successfully!')
                    .setDescription(`**${buildData.name}** has been added to your guild's builds!`)
                    .addFields(
                        { name: '📝 Build Name', value: buildData.name, inline: true },
                        { name: '⚔️ Weapon', value: buildData.weapon || 'Not specified', inline: true },
                        { name: '🛡️ Offhand', value: buildData.offhand || 'Not specified', inline: true },
                        { name: '🧣 Cape', value: buildData.cape || 'Not specified', inline: true },
                        { name: '👑 Head', value: buildData.head || 'Not specified', inline: true },
                        { name: '🥋 Chest', value: buildData.chest || 'Not specified', inline: true },
                        { name: '👟 Shoes', value: buildData.shoes || 'Not specified', inline: true },
                        { name: '🍖 Food', value: buildData.food || 'Not specified', inline: true },
                        { name: '🧪 Potion', value: buildData.potion || 'Not specified', inline: true },
                        { name: '🎯 Content Type', value: buildData.contentType || 'General', inline: true }
                    )
                    .addFields(
                        { name: '💡 Next Steps', value: 'Use `/build-edit` to add or update equipment details later!', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot • Build created successfully' })
                    .setTimestamp();
                
                // Clear the build data
                interaction.client.buildData.delete(userId);
                console.log(`Build data cleared for user ${userId}`);
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Build creation completed successfully');
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Create Build')
                    .setDescription('Failed to create build. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                console.log('Build creation failed in database');
            }
        } catch (error) {
            console.error('Error in finalizeBuild:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Creating Build')
                .setDescription('An unexpected error occurred while creating the build. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async cancelBuild(interaction) {
        const userId = interaction.user.id;
        interaction.client.buildData.delete(userId);

        const embed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('❌ Build Creation Cancelled')
            .setDescription('Build creation has been cancelled. All data has been cleared.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });
    },

    async handleDelete(interaction, db) {
        // Check if user has permission
        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission`);
        } else {
            // Check if user has build permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'build');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct build permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have build permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'build');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has build permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to delete builds.\n\n**Required:** Administrator role or build permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types for delete:', contentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('delete_content_type_select')
            .setPlaceholder('Select content type to delete builds from')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('All Content Types')
                    .setDescription('Delete builds from all content types')
                    .setValue('all')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('Delete only general builds')
                    .setValue('General')
                    .setEmoji('📄'),
                ...contentTypes.map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Delete builds for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        // If no custom content types exist, show a helpful message
        if (contentTypes.length === 0) {
            contentTypeSelect.setPlaceholder('No content types added yet - select All Content Types');
        }

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🗑️ Build Deletion')
            .setDescription('Select the content type and build name you want to delete. A confirmation button is provided for safety.')
            .addFields(
                { name: '📊 Current Filter', value: 'No filter selected yet', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Select content type and build name' })
            .setTimestamp();

        // Create buttons for each build component
        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);
        
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('delete_build_name_filter')
                    .setLabel('🔍 Filter by Name')
                    .setStyle(ButtonStyle.Secondary)
            );

        // Store list data temporarily
        const listData = {
            contentType: null,
            buildName: null,
            contentTypes: contentTypes // Store content types to avoid refetching
        };
        interaction.client.listData = interaction.client.listData || new Map();
        interaction.client.listData.set(interaction.user.id, listData);

        await interaction.reply({
            embeds: [embed],
            components: [contentTypeRow, buttonRow],
            ephemeral: true
        });
    },

    async handleList(interaction, db) {
        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types for list:', contentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('list_content_type_select')
            .setPlaceholder('Select content type to filter builds')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('All Builds')
                    .setDescription('Show all builds regardless of content type')
                    .setValue('all')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('Show only general builds')
                    .setValue('General')
                    .setEmoji('📄'),
                ...contentTypes.map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Show builds for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📋 Build List')
            .setDescription('**Step 1:** Select a content type from the dropdown below to see builds.\n**Step 2:** After selecting content type, pick a build from the dropdown to view details.')
            .addFields(
                { name: '📊 Current Filter', value: 'No filter selected yet', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Select content type first, then pick a build' })
            .setTimestamp();

        // Store list data temporarily
        const listData = {
            contentType: null,
            buildName: null,
            contentTypes: contentTypes // Store content types to avoid refetching
        };
        interaction.client.listData = interaction.client.listData || new Map();
        interaction.client.listData.set(interaction.user.id, listData);

        await interaction.reply({
            embeds: [embed],
            components: [contentTypeRow],
            ephemeral: true
        });
    },

    async handleListInteraction(interaction, db) {
        try {
            const userId = interaction.user.id;
            const listData = interaction.client.listData?.get(userId) || {};

            console.log(`List interaction: ${interaction.customId} by user ${userId}`);

            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'list_content_type_select') {
                    const selectedContentType = interaction.values[0];
                    console.log('Content type selected for list:', selectedContentType);
                    
                    listData.contentType = selectedContentType;
                    interaction.client.listData.set(userId, listData);

                    // Get builds based on selection
                    let builds;
                    if (selectedContentType === 'all') {
                        builds = await db.getBuilds(interaction.guildId, null, null);
                    } else {
                        builds = await db.getBuilds(interaction.guildId, selectedContentType, null);
                    }

                    // Create the builds display embed
                    const embed = await this.createBuildsDisplayEmbed(builds, selectedContentType);
                    
                    // Update the original message with builds and build name selection
                    try {
                        // Create a build name dropdown if there are builds available
                        let buildNameRow = null;
                        if (builds.length > 0) {
                            const buildNameSelect = new StringSelectMenuBuilder()
                                .setCustomId('list_build_name_select')
                                .setPlaceholder('Select a build to view details')
                                .addOptions(
                                    builds.map(build => 
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(build.name)
                                            .setDescription(`${build.weapon} | ${build.contentType}`)
                                            .setValue(build.name)
                                            .setEmoji('⚔️')
                                    )
                                );

                            buildNameRow = new ActionRowBuilder().addComponents(buildNameSelect);
                        }

                        // Recreate the content type dropdown to maintain the interface
                        const contentTypeSelect = new StringSelectMenuBuilder()
                            .setCustomId('list_content_type_select')
                            .setPlaceholder('Content type: ' + selectedContentType)
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel('All Builds')
                                    .setDescription('Show all builds regardless of content type')
                                    .setValue('all')
                                    .setEmoji('📋'),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel('General')
                                    .setDescription('Show only general builds')
                                    .setValue('General')
                                    .setEmoji('📄'),
                                ...(listData.contentTypes || []).map(ct => 
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(ct)
                                        .setDescription(`Show builds for ${ct}`)
                                        .setValue(ct)
                                        .setEmoji('🎯')
                                )
                            ]);

                        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);
                        
                        // Combine all components
                        const components = [contentTypeRow];
                        if (buildNameRow) {
                            components.push(buildNameRow);
                        }
                        
                        await interaction.update({
                            embeds: [embed],
                            components: components
                        });
                        console.log('List updated successfully with builds and build name selection');
                    } catch (error) {
                        console.error('Error updating list message:', error);
                        await interaction.followUp({
                            content: `✅ Showing builds for: ${selectedContentType === 'all' ? 'All Content Types' : selectedContentType}`,
                            ephemeral: true
                        });
                    }
                    return;
                } else if (interaction.customId === 'list_build_name_select') {
                    // Handle build name selection
                    const selectedBuildName = interaction.values[0];
                    console.log('Build name selected:', selectedBuildName);
                    
                    // Get the specific build details
                    let builds;
                    if (listData.contentType === 'all' || !listData.contentType) {
                        builds = await db.getBuilds(interaction.guildId, null, selectedBuildName);
                    } else {
                        builds = await db.getBuilds(interaction.guildId, listData.contentType, selectedBuildName);
                    }
                    
                    if (builds.length > 0) {
                        const selectedBuild = builds[0]; // Should be the exact match
                        
                        // Create detailed build view embed
                        const detailedEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle(`⚔️ ${selectedBuild.name}`)
                            .setDescription(`**Detailed Build Information**`)
                            .addFields(
                                { name: '⚔️ Weapon', value: selectedBuild.weapon, inline: true },
                                { name: '🛡️ Offhand', value: selectedBuild.offhand || 'None', inline: true },
                                { name: '🧣 Cape', value: selectedBuild.cape, inline: true },
                                { name: '👑 Head', value: selectedBuild.head, inline: true },
                                { name: '🥋 Chest', value: selectedBuild.chest, inline: true },
                                { name: '👟 Shoes', value: selectedBuild.shoes, inline: true },
                                { name: '🍖 Food', value: selectedBuild.food, inline: true },
                                { name: '🧪 Potion', value: selectedBuild.potion, inline: true },
                                { name: '🎯 Content Type', value: selectedBuild.contentType, inline: true }
                            )
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                        
                        // Add creation info if available
                        if (selectedBuild.createdAt) {
                            const createdDate = new Date(selectedBuild.createdAt).toLocaleDateString();
                            detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
                        }
                        
                        // Update the message with detailed build view
                        await interaction.update({
                            embeds: [detailedEmbed],
                            components: interaction.message.components
                        });
                        console.log('Build details displayed successfully');
                    } else {
                        await interaction.update({
                            content: `❌ Build "${selectedBuildName}" not found.`,
                            ephemeral: true
                        });
                    }
                    return;
                }
            }

            if (interaction.isButton()) {
                // No more button interactions needed since we removed the filter button
                console.log('Button interaction detected but no buttons are currently used');
            }

        } catch (error) {
            console.error('Error in handleListInteraction:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your interaction. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async handleDeleteInteraction(interaction, db) {
        try {
            const userId = interaction.user.id;
            const listData = interaction.client.listData?.get(userId) || {};

            console.log(`Delete interaction: ${interaction.customId} by user ${userId}`);

            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'delete_content_type_select') {
                    const selectedContentType = interaction.values[0];
                    console.log('Content type selected for delete:', selectedContentType);
                    
                    listData.contentType = selectedContentType;
                    interaction.client.listData.set(userId, listData);

                    // Get builds based on selection
                    let builds;
                    if (selectedContentType === 'all') {
                        builds = await db.getBuilds(interaction.guildId, null, null);
                    } else {
                        builds = await db.getBuilds(interaction.guildId, selectedContentType, null);
                    }

                    // Create the builds display embed
                    const embed = await this.createBuildsDisplayEmbed(builds, selectedContentType);
                    
                    // Update the original message with builds and build name selection
                    try {
                        // Create a build name dropdown if there are builds available
                        let buildNameRow = null;
                        if (builds.length > 0) {
                            const buildNameSelect = new StringSelectMenuBuilder()
                                .setCustomId('delete_build_name_select')
                                .setPlaceholder('Select a build to delete')
                                .addOptions(
                                    builds.map(build => 
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(build.name)
                                            .setDescription(`${build.weapon} | ${build.contentType}`)
                                            .setValue(build.name)
                                            .setEmoji('⚔️')
                                    )
                                );

                            buildNameRow = new ActionRowBuilder().addComponents(buildNameSelect);
                        }

                        // Recreate the content type dropdown to maintain the interface
                        const contentTypeSelect = new StringSelectMenuBuilder()
                            .setCustomId('delete_content_type_select')
                            .setPlaceholder('Content type: ' + selectedContentType)
                            .addOptions([
                                new StringSelectMenuOptionBuilder()
                                    .setLabel('All Content Types')
                                    .setDescription('Delete builds from all content types')
                                    .setValue('all')
                                    .setEmoji('📋'),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel('General')
                                    .setDescription('Delete only general builds')
                                    .setValue('General')
                                    .setEmoji('📄'),
                                ...(listData.contentTypes || []).map(ct => 
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(ct)
                                        .setDescription(`Delete builds for ${ct}`)
                                        .setValue(ct)
                                        .setEmoji('🎯')
                                )
                            ]);

                        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);
                        
                        // Create button row with filter and confirm delete buttons
                        const buttonRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('delete_build_name_filter')
                                    .setLabel('🔍 Filter by Name')
                                    .setStyle(ButtonStyle.Secondary)
                            );
                        
                        // Combine all components
                        const components = [contentTypeRow];
                        if (buildNameRow) {
                            components.push(buildNameRow);
                        }
                        components.push(buttonRow);
                        
                        await interaction.update({
                            embeds: [embed],
                            components: components
                        });
                        console.log('Delete updated successfully with builds and build name selection');
                    } catch (error) {
                        console.error('Error updating delete message:', error);
                        await interaction.followUp({
                            content: `✅ Showing builds for: ${selectedContentType === 'all' ? 'All Content Types' : selectedContentType}`,
                            ephemeral: true
                        });
                    }
                    return;
                } else if (interaction.customId === 'delete_build_name_select') {
                    // Handle build name selection
                    const selectedBuildName = interaction.values[0];
                    console.log('Build name selected for delete:', selectedBuildName);
                    
                    // Update the listData with the selected build name
                    listData.buildName = selectedBuildName;
                    interaction.client.listData.set(userId, listData);
                    console.log('Updated listData with build name:', listData);
                    
                    // Get the specific build details
                    let builds;
                    if (listData.contentType === 'all' || !listData.contentType) {
                        builds = await db.getBuilds(interaction.guildId, null, selectedBuildName);
                    } else {
                        builds = await db.getBuilds(interaction.guildId, listData.contentType, selectedBuildName);
                    }
                    
                    if (builds.length > 0) {
                        const selectedBuild = builds[0]; // Should be the exact match
                        
                        // Create detailed build view embed
                        const detailedEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle(`🗑️ ${selectedBuild.name}`)
                            .setDescription(`**Detailed Build Information**`)
                            .addFields(
                                { name: '⚔️ Weapon', value: selectedBuild.weapon, inline: true },
                                { name: '🛡️ Offhand', value: selectedBuild.offhand || 'None', inline: true },
                                { name: '🧣 Cape', value: selectedBuild.cape, inline: true },
                                { name: '👑 Head', value: selectedBuild.head, inline: true },
                                { name: '🥋 Chest', value: selectedBuild.chest, inline: true },
                                { name: '👟 Shoes', value: selectedBuild.shoes, inline: true },
                                { name: '🍖 Food', value: selectedBuild.food, inline: true },
                                { name: '🧪 Potion', value: selectedBuild.potion, inline: true },
                                { name: '🎯 Content Type', value: selectedBuild.contentType, inline: true }
                            )
                            .setFooter({ text: 'Phoenix Assistance Bot' })
                            .setTimestamp();
                        
                        // Add creation info if available
                        if (selectedBuild.createdAt) {
                            const createdDate = new Date(selectedBuild.createdAt).toLocaleDateString();
                            detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
                        }
                        
                        // Update the message with detailed build view
                        await interaction.update({
                            embeds: [detailedEmbed],
                            components: [
                                // Recreate content type dropdown
                                new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('delete_content_type_select')
                                        .setPlaceholder('Content type: ' + listData.contentType)
                                        .addOptions(
                                            new StringSelectMenuOptionBuilder()
                                                .setLabel('All Content Types')
                                                .setDescription('Delete builds from all content types')
                                                .setValue('all')
                                                .setEmoji('📋'),
                                            new StringSelectMenuOptionBuilder()
                                                .setLabel('General')
                                                .setDescription('Delete only general builds')
                                                .setValue('General')
                                                .setEmoji('📄'),
                                            ...(listData.contentTypes || []).map(ct => 
                                                new StringSelectMenuOptionBuilder()
                                                    .setLabel(ct)
                                                    .setDescription(`Delete builds for ${ct}`)
                                                    .setValue(ct)
                                                    .setEmoji('🎯')
                                            )
                                        )
                                ),
                                // Recreate build name dropdown
                                new ActionRowBuilder().addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('delete_build_name_select')
                                        .setPlaceholder('Build: ' + selectedBuildName)
                                        .addOptions(
                                            builds.map(build => 
                                                new StringSelectMenuOptionBuilder()
                                                    .setLabel(build.name)
                                                    .setDescription(`${build.weapon} | ${build.contentType}`)
                                                    .setValue(build.name)
                                                    .setEmoji('⚔️')
                                            )
                                        )
                                ),
                                // Add confirm delete button
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('confirm_delete_build')
                                        .setLabel('🗑️ Confirm Delete Build')
                                        .setStyle(ButtonStyle.Danger)
                                )
                            ]
                        });
                        console.log('Build details displayed successfully for deletion');
                    } else {
                        await interaction.update({
                            content: `❌ Build "${selectedBuildName}" not found.`,
                            ephemeral: true
                        });
                    }
                    return;
                }
            }

            if (interaction.isButton()) {
                if (interaction.customId === 'delete_build_name_filter') {
                    await this.showNameFilterModal(interaction);
                } else if (interaction.customId === 'confirm_delete_build') {
                    await this.handleConfirmDelete(interaction, db);
                }
            }

        } catch (error) {
            console.error('Error in handleDeleteInteraction:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your interaction. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async showNameFilterModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('list_name_filter_modal')
            .setTitle('🔍 Filter Builds by Name');

        const input = new TextInputBuilder()
            .setCustomId('list_name_filter_input')
            .setLabel('Build Name Search')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type part of a build name (e.g., "PvP", "Dungeon")')
            .setRequired(false)
            .setMaxLength(100);

        const actionRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async handleListNameFilterModal(interaction, db) {
        try {
            const userId = interaction.user.id;
            const modalId = interaction.customId;
            
            if (modalId === 'list_name_filter_modal') {
                const listData = interaction.client.listData?.get(userId) || {};
                const buildName = interaction.fields.getTextInputValue('list_name_filter_input');

                console.log(`List name filter modal submitted - Name: ${buildName}, User: ${userId}`);

                // Update list data
                listData.buildName = buildName;
                interaction.client.listData.set(userId, listData);

                // Get builds with both content type and name filters
                let builds;
                if (listData.contentType === 'all' || !listData.contentType) {
                    builds = await db.getBuilds(interaction.guildId, null, buildName);
                } else {
                    builds = await db.getBuilds(interaction.guildId, listData.contentType, buildName);
                }

                // Create the builds display embed
                const contentType = listData.contentType || 'all';
                const embed = await this.createBuildsDisplayEmbed(builds, contentType, buildName);

                // Update the original message with filtered builds
                try {
                    await interaction.update({
                        embeds: [embed],
                        components: interaction.message.components
                    });
                    console.log('List updated successfully with name filter');
                } catch (error) {
                    console.error('Error updating list message:', error);
                    await interaction.followUp({
                        content: `✅ Filtered builds by name: ${buildName || 'All names'}`,
                        ephemeral: true
                    });
                }
            } else if (modalId === 'delete_name_filter_modal') {
                const listData = interaction.client.listData?.get(userId) || {};
                const buildName = interaction.fields.getTextInputValue('delete_name_filter_input');

                console.log(`Delete name filter modal submitted - Name: ${buildName}, User: ${userId}`);

                // Update list data
                listData.buildName = buildName;
                interaction.client.listData.set(userId, listData);

                // Get builds with both content type and name filters
                let builds;
                if (listData.contentType === 'all' || !listData.contentType) {
                    builds = await db.getBuilds(interaction.guildId, null, buildName);
                } else {
                    builds = await db.getBuilds(interaction.guildId, listData.contentType, buildName);
                }

                // Create the builds display embed for deletion
                const contentType = listData.contentType || 'all';
                const embed = await this.createBuildsDisplayEmbed(builds, contentType, buildName);

                // Update the original message with filtered builds
                try {
                    await interaction.update({
                        embeds: [embed],
                        components: interaction.message.components
                    });
                    console.log('Delete updated successfully with name filter');
                } catch (error) {
                    console.error('Error updating delete message:', error);
                    await interaction.followUp({
                        content: `✅ Filtered builds by name: ${buildName || 'All names'}`,
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('Error in handleListNameFilterModal:', error);
            try {
                await interaction.reply({
                    content: '❌ An error occurred while processing your name filter. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async createBuildsDisplayEmbed(builds, contentType, buildName = null) {
        if (builds.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('📋 Builds')
                .setDescription('No builds found matching your criteria.')
                .addFields(
                    { name: '💡 Tip', value: 'Use `/build create` to add your first build!', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            if (contentType && contentType !== 'all') {
                embed.addFields({ name: '🔍 Current Filter', value: `Content Type: ${contentType}`, inline: true });
            }
            if (buildName) {
                embed.addFields({ name: '🔍 Current Filter', value: `Name: ${buildName}`, inline: true });
            }

            return embed;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📋 Available Builds')
            .setDescription(`Found **${builds.length}** build(s):`)
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        // Add filter information
        if (contentType && contentType !== 'all') {
            embed.addFields({ name: '🔍 Content Type Filter', value: contentType, inline: true });
        }
        if (buildName) {
            embed.addFields({ name: '🔍 Name Filter', value: buildName, inline: true });
        }

        // Split builds into chunks to avoid embed field limit
        const chunks = this.chunkArray(builds, 10); // Increased chunk size since we're only showing names
        
        chunks.forEach((chunk, index) => {
            const buildList = chunk.map(build => 
                `• **${build.name}**`
            ).join('\n');

            embed.addFields({
                name: `Choose Build Name to show Details`,
                value: buildList,
                inline: false
            });
        });

        return embed;
    },

    async handleConfirmDelete(interaction, db) {
        try {
            const userId = interaction.user.id;
            const listData = interaction.client.listData?.get(userId) || {};
            const buildName = listData.buildName;
            const contentType = listData.contentType || 'all';

            console.log(`Confirmation received - Content Type: ${contentType}, Name: ${buildName}, User: ${userId}`);

            if (!buildName) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ No Build Selected')
                    .setDescription('Please select a build name first before confirming deletion.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            let success = false;
            if (contentType === 'all') {
                success = await db.deleteBuild(interaction.guildId, buildName);
            } else {
                success = await db.deleteBuild(interaction.guildId, buildName);
            }

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Build Deleted Successfully!')
                    .setDescription(`**${buildName}** has been removed from your guild's builds.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Build deletion completed successfully');
                
                // Clear the stored data
                interaction.client.listData.delete(userId);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Delete Build')
                    .setDescription('Failed to delete build. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Build deletion failed in database');
            }
        } catch (error) {
            console.error('Error in handleConfirmDelete:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Deleting Build')
                .setDescription('An unexpected error occurred while deleting the build. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
};
