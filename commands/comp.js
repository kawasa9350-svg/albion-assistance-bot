const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comp')
        .setDescription('Manage Albion Online comps')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new comp interactively'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List comps interactively'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a comp interactively'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('lock')
                .setDescription('DO NOT USE THIS COMMAND, IT IS FOR INTERNAL USE ONLY')),

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
                case 'list':
                    await this.handleList(interaction, db);
                    break;
                case 'delete':
                    await this.handleDelete(interaction, db);
                    break;
                case 'lock':
                    await this.handleLock(interaction, db);
                    break;
                default:
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Unknown subcommand!', ephemeral: true });
                    }
            }
        } catch (error) {
            console.error('Error in comp command:', error);
            
            // Only reply if we haven't already replied or deferred
            if (!interaction.replied && !interaction.deferred) {
                try {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('An error occurred while processing the comp command.')
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
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
            // Check if user has comp permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'comp');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct comp permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have comp permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'comp');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has comp permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to create comps.\n\n**Required:** Administrator role or comp permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types for comp:', contentTypes);

        // Ensure content types are unique and filter out any duplicates
        const uniqueContentTypes = [...new Set(contentTypes)].filter(ct => ct && typeof ct === 'string' && ct.trim() !== '');
        console.log('Unique content types after filtering:', uniqueContentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('comp_content_type_select')
            .setPlaceholder('Select content type for your comp')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('General purpose comp')
                    .setValue('General')
                    .setEmoji('📄'),
                ...uniqueContentTypes.filter(ct => ct !== 'General').map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Comp for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        // If no custom content types exist, show a helpful message
        if (contentTypes.length === 0) {
            contentTypeSelect.setPlaceholder('No content types added yet - select General');
        }

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🎭 Comp Creation')
            .setDescription('**Step 1:** Select a content type for your comp.\n\nAfter selecting, you can name your comp and choose builds.')
            .setFooter({ text: 'Phoenix Assistance Bot • Step 1 of 3' })
            .setTimestamp();

        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

        // Store comp data in the interaction
        const compData = {
            name: '',
            contentType: '',
            builds: [],
            contentTypes: contentTypes
        };

        // Store the comp data temporarily
        interaction.client.compData = interaction.client.compData || new Map();
        interaction.client.compData.set(interaction.user.id, compData);

        await interaction.reply({
            embeds: [embed],
            components: [contentTypeRow],
            ephemeral: true
        });
    },

    async handleButtonInteraction(interaction, db) {
        try {
            const userId = interaction.user.id;
            
            // Ensure compData Map exists
            if (!interaction.client.compData) {
                interaction.client.compData = new Map();
            }
            
            const compData = interaction.client.compData.get(userId) || {};

            console.log(`Comp interaction: ${interaction.customId} by user ${userId}`);
            console.log('Current comp data:', compData);

            // Handle select menu interactions
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'comp_content_type_select') {
                    console.log('Content type selected:', interaction.values[0]);
                    compData.contentType = interaction.values[0];
                    interaction.client.compData.set(userId, compData);

                    // Create a new embed for step 2
                    const embed = new EmbedBuilder()
                        .setColor('#9B59B6')
                                    .setTitle('🎭 Comp Creation')
            .setDescription(`**Step 2:** Enter a name for your comp.\n\n**Selected Content Type:** ${compData.contentType}`)
                        .setFooter({ text: 'Phoenix Assistance Bot • Step 2 of 3' })
                        .setTimestamp();

                    // Create comp name input button
                    const nameButton = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('comp_name')
                                .setLabel('📝 Enter Comp Name')
                                .setStyle(ButtonStyle.Primary)
                        );

                    // Update the original message with step 2
                    try {
                        await interaction.update({
                            embeds: [embed],
                            components: [nameButton]
                        });
                        console.log('Message updated to step 2 (comp name)');
                    } catch (error) {
                        console.error('Error updating message:', error);
                        // Fallback: send a new message
                        await interaction.followUp({
                            content: `✅ Content Type Selected: ${compData.contentType}. Please click the button to enter comp name.`,
                            ephemeral: true
                        });
                    }
                    return;
                }
            }

            // Handle button interactions
            switch (interaction.customId) {
                case 'comp_name':
                    console.log('Opening comp name modal...');
                    await this.showModal(interaction, 'name', 'Comp Name', 'Enter comp name:', compData.name);
                    break;
                case 'comp_add_builds':
                    console.log('Opening build selection...');
                    await this.showBuildSelection(interaction, db, compData);
                    break;
                case 'comp_add_build_manual':
                    console.log('Opening manual build input modal...');
                    await this.showModal(interaction, 'build', 'Build Name', 'Enter build name to add:', '');
                    break;
                case 'comp_remove_build':
                    console.log('Removing last build...');
                    await this.removeLastBuild(interaction, db, compData);
                    break;
                case 'comp_create':
                    console.log('Finalizing comp...');
                    await this.finalizeComp(interaction, db, compData);
                    break;
                case 'comp_cancel':
                                            console.log('Cancelling comp...');
                    await this.cancelComp(interaction);
                    break;
                default:
                    // Check if this is a build detail button
                    if (interaction.customId.startsWith('comp_build_detail_')) {
                        // Extract build ID from custom ID format: comp_build_detail_${buildId}
                        const buildId = interaction.customId.replace('comp_build_detail_', '');
                        console.log(`Opening build detail for build ID: ${buildId}`);
                        
                        // Get the build by ID
                        const build = await db.getBuildById(interaction.guildId, buildId);
                        if (build) {
                            await this.handleBuildDetail(interaction, db, build.name, build.compId);
                        } else {
                            await interaction.reply({
                                content: '❌ Build not found.',
                                ephemeral: true
                            });
                        }
                    } else if (interaction.customId.startsWith('comp_build_edit_')) {
                        // Handle build edit button from comp list
                        const buildId = interaction.customId.replace('comp_build_edit_', '');
                        console.log(`Opening build edit for build ID: ${buildId}`);
                        await this.handleBuildEditFromComp(interaction, db, buildId);
                    } else {
                        console.log(`Unknown interaction: ${interaction.customId}`);
                    }
            }
        } catch (error) {
            console.error('Error in handleButtonInteraction:', error);
            try {
                await interaction.followUp({
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
            .setCustomId(`comp_modal_${field}`)
            .setTitle(`${title} - ${interaction.message.embeds[0].title}`);

        const input = new TextInputBuilder()
            .setCustomId(`comp_input_${field}`)
            .setLabel(label)
            .setStyle(TextInputStyle.Short)
            .setValue(currentValue || '')
            .setRequired(true)
            .setMaxLength(100);

        const actionRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },

    async handleModalSubmit(interaction, db) {
        try {
            const userId = interaction.user.id;
            
            // Ensure compData Map exists
            if (!interaction.client.compData) {
                interaction.client.compData = new Map();
            }
            
            const compData = interaction.client.compData.get(userId) || {};
            
            // Extract the field name from the modal custom ID
            const field = interaction.customId.replace('comp_modal_', '');
            const value = interaction.fields.getTextInputValue(`comp_input_${field}`);

            console.log(`Comp modal submitted - Field: ${field}, Value: ${value}, User: ${userId}`);

            if (field === 'build') {
                // Handle build name input
                if (!value.trim()) {
                    await interaction.reply({
                        content: '❌ Build name cannot be empty. Please try again.',
                        ephemeral: true
                    });
                    return;
                }

                // Add build to comp (allow duplicates)
                compData.builds.push(value.trim());
                interaction.client.compData.set(userId, compData);
                console.log('Updated comp data with new build:', compData);

                // Show updated build selection interface
                await this.showBuildSelection(interaction, db, compData);
                return;
            }

            // Handle other fields (like comp name)
            compData[field] = value;
            interaction.client.compData.set(userId, compData);

            console.log('Updated comp data:', compData);

            // Create a new embed for step 3 (build selection)
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🎭 Comp Creation')
                .setDescription(`**Step 3:** Add builds to your comp.\n\n**Comp:** ${compData.name}\n**Content Type:** ${compData.contentType}\n\nYou can add up to 20 builds by typing their names manually. You can include the same build multiple times for variations.`)
                .setFooter({ text: 'Phoenix Assistance Bot • Step 3 of 3' })
                .setTimestamp();

            // Create build selection button
            const buildButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('comp_add_builds')
                        .setLabel('⚔️ Add Builds')
                        .setStyle(ButtonStyle.Success)
                );

            // Update the original message with step 3
            try {
                await interaction.update({
                    embeds: [embed],
                    components: [buildButton]
                });
                console.log('Message updated to step 3 (build selection)');
            } catch (error) {
                console.error('Error updating message:', error);
                // Fallback: send a new message
                await interaction.followUp({
                    content: `✅ Comp Name Set: ${value}. Please click the button to add builds.`,
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

    async showBuildSelection(interaction, db, compData) {
        try {
            // Check if we've reached the 20 build limit
            if (compData.builds.length >= 20) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Build Limit Reached')
                    .setDescription(`You have already selected **20 builds** for this comp.\n\n**Current Builds:**\n${compData.builds.map((build, index) => `${index + 1}. ${build}`).join('\n')}\n\nClick "Create Comp" to finalize.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                const finalizeButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('comp_create')
                            .setLabel('✅ Create Composition')
                            .setStyle(ButtonStyle.Success)
                    );

                await interaction.update({ embeds: [embed], components: [finalizeButton] });
                return;
            }

            // Create the build input interface
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🎭 Add Builds to Comp')
                .setDescription(`**Comp:** ${compData.name}\n**Content Type:** ${compData.contentType}\n\n**Current Builds (${compData.builds.length}/20):**\n${compData.builds.length > 0 ? compData.builds.map((build, index) => `${index + 1}. ${build}`).join('\n') : 'No builds added yet'}\n\n**Instructions:**\n• Click "📝 Add Build" to manually type a build name\n• You can type any build name (existing or new)\n• You can add the same build multiple times for variations\n• Builds will be added in the order you enter them`)
                .setFooter({ text: 'Phoenix Assistance Bot • Type build names manually' })
                .setTimestamp();

            // Create action buttons
            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('comp_add_build_manual')
                        .setLabel('📝 Add Build')
                        .setStyle(ButtonStyle.Primary)
                );

            // Add remove build button if there are builds to remove
            if (compData.builds.length > 0) {
                actionButtons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('comp_remove_build')
                        .setLabel('🗑️ Remove Last Build')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            // Add final action buttons
            actionButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId('comp_create')
                    .setLabel('✅ Create Comp')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('comp_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.update({
                embeds: [embed],
                components: [actionButtons]
            });
        } catch (error) {
            console.error('Error showing build selection:', error);
            await interaction.followUp({
                content: '❌ An error occurred while loading the build interface. Please try again.',
                ephemeral: true
            });
        }
    },

    async removeLastBuild(interaction, db, compData) {
        try {
            const userId = interaction.user.id;
            
            if (compData.builds.length === 0) {
                await interaction.reply({
                    content: '❌ No builds to remove.',
                    ephemeral: true
                });
                return;
            }

            const removedBuild = compData.builds.pop();
            interaction.client.compData.set(userId, compData);
            console.log(`Removed build "${removedBuild}" from comp. Updated comp data:`, compData);

            // Show updated build selection interface
            await this.showBuildSelection(interaction, db, compData);
        } catch (error) {
            console.error('Error removing last build:', error);
            await interaction.followUp({
                content: '❌ An error occurred while removing the build. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleBuildDetail(interaction, db, buildName, compId = null) {
        try {
            // Get the build details from the database with exact name matching
            const builds = await db.getBuilds(interaction.guildId, null, buildName, compId);
            
            // Filter for exact name match to prevent partial matching (e.g., "test" matching "testt")
            const exactMatch = builds.find(build => build.name === buildName);
            
            if (!exactMatch) {
                // Build doesn't exist - create a new clean build automatically
                console.log(`Build "${buildName}" not found (exact match), creating new clean build`);
                console.log(`Available builds: ${builds.map(b => b.name).join(', ')}`);
                
                // Create a new clean build object
                const newBuild = {
                    name: buildName,
                    weapon: 'Not specified',
                    offhand: 'Not specified',
                    cape: 'Not specified',
                    head: 'Not specified',
                    chest: 'Not specified',
                    shoes: 'Not specified',
                    food: 'Not specified',
                    potion: 'Not specified',
                    contentType: 'General', // Default content type
                    createdBy: interaction.user.id,
                    createdAt: new Date()
                };
                
                // Add the new build to the database (comp-specific if compId provided)
                const buildId = await db.addBuild(interaction.guildId, newBuild, compId);
                
                if (buildId) {
                    console.log(`Successfully created new build: ${buildName}`);
                    
                    // Create embed showing the new clean build
                    const embed = new EmbedBuilder()
                        .setColor('#00AA00')
                        .setTitle(`⚔️ ${buildName} (New Build)`)
                        .setDescription(`**This build was automatically created from your comp!**\n\nIt's currently a clean template that you can customize later using the \`/build edit\` command.`)
                        .addFields(
                            { name: '⚔️ Weapon', value: 'Not specified', inline: true },
                            { name: '🛡️ Offhand', value: 'Not specified', inline: true },
                            { name: '🧣 Cape', value: 'Not specified', inline: true },
                            { name: '👑 Head', value: 'Not specified', inline: true },
                            { name: '🥋 Chest', value: 'Not specified', inline: true },
                            { name: '👟 Shoes', value: 'Not specified', inline: true },
                            { name: '🍖 Food', value: 'Not specified', inline: true },
                            { name: '🧪 Potion', value: 'Not specified', inline: true },
                            { name: '🎯 Content Type', value: 'General', inline: true }
                        )
                        .setFooter({ text: 'Phoenix Assistance Bot • Auto-created from comp' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    console.log(`New build "${buildName}" displayed and saved to database`);
                } else {
                    // Failed to save to database
                    const embed = new EmbedBuilder()
                        .setColor('#FFAA00')
                        .setTitle(`⚠️ ${buildName}`)
                        .setDescription(`**Build not found in database**\n\nThis build name was referenced in your comp but doesn't exist yet. You can create it manually using \`/build create\` or edit an existing build.`)
                        .setFooter({ text: 'Phoenix Assistance Bot • Build not found' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    console.log(`Failed to create new build: ${buildName}`);
                }
                return;
            }
            
            const build = exactMatch; // Use the exact match
            
            // Check if user has build-edit permission
            const member = interaction.member;
            let hasBuildEditPermission = false;
            
            // Check if user is admin
            if (member.permissions.has('Administrator')) {
                hasBuildEditPermission = true;
                console.log(`User ${interaction.user.id} has Administrator permission for build editing`);
            } else {
                // Check if user has build permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'build');
                    if (userHasPermission) {
                        hasBuildEditPermission = true;
                        console.log(`User ${interaction.user.id} has direct build permission for editing`);
                    }
                } catch (error) {
                    console.error('Error checking user build permission:', error);
                }
                
                // Check if any of user's roles have build permission
                if (!hasBuildEditPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'build');
                            if (roleHasPermission) {
                                hasBuildEditPermission = true;
                                console.log(`User ${interaction.user.id} has build permission through role: ${role.name}`);
                                break;
                            }
                        } catch (error) {
                            console.error(`Error checking role ${role.id} build permission:`, error);
                        }
                    }
                }
            }
            
            // Create detailed build view embed (same format as /build list)
            const detailedEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`⚔️ ${build.name}`)
                .setDescription(`**Detailed Build Information**`)
                .addFields(
                    { name: '⚔️ Weapon', value: build.weapon, inline: true },
                    { name: '🛡️ Offhand', value: build.offhand || 'None', inline: true },
                    { name: '🧣 Cape', value: build.cape, inline: true },
                    { name: '👑 Head', value: build.head, inline: true },
                    { name: '🥋 Chest', value: build.chest, inline: true },
                    { name: '👟 Shoes', value: build.shoes, inline: true },
                    { name: '🍖 Food', value: build.food, inline: true },
                    { name: '🧪 Potion', value: build.potion, inline: true },
                    { name: '🎯 Content Type', value: build.contentType, inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            // Add creation info if available
            if (build.createdAt) {
                const createdDate = new Date(build.createdAt).toLocaleDateString();
                detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
            }
            
            // Add creator info if available
            if (build.createdBy) {
                detailedEmbed.addFields({ name: '👤 Created By', value: `<@${build.createdBy}>`, inline: true });
            }
            
            // Create components array
            const components = [];
            
            // Add edit button if user has build-edit permission
            if (hasBuildEditPermission) {
                const editButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`comp_build_edit_${build.buildId}`)
                            .setLabel('🔧 Edit Build')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔧')
                    );
                components.push(editButton);
            }
            
            // Send the build details as an ephemeral message
            await interaction.reply({ 
                embeds: [detailedEmbed], 
                components: components,
                ephemeral: true 
            });
            console.log(`Build details displayed for: ${buildName}${hasBuildEditPermission ? ' with edit button' : ''}`);
            
        } catch (error) {
            console.error('Error handling build detail:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading build details. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleBuildEditFromComp(interaction, db, buildId) {
        try {
            // Get the specific build data by ID
            const build = await db.getBuildById(interaction.guildId, buildId);
            
            if (!build) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Build Not Found')
                    .setDescription('The selected build could not be found.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Store build data for editing (similar to build-edit.js)
            if (!interaction.client.editBuildData) {
                interaction.client.editBuildData = new Map();
            }
            interaction.client.editBuildData.set(interaction.user.id, { 
                build, 
                originalName: buildName,
                fromComp: true // Flag to indicate this came from comp list
            });

            // Create edit options menu (same as build-edit.js)
            const editOptions = [
                { label: 'Build Name', value: 'edit_name', description: 'Change the build name' },
                { label: 'Content Type', value: 'edit_content_type', description: 'Change the content type' },
                { label: 'Weapon', value: 'edit_weapon', description: 'Change the weapon' },
                { label: 'Offhand', value: 'edit_offhand', description: 'Change the offhand item' },
                { label: 'Cape', value: 'edit_cape', description: 'Change the cape' },
                { label: 'Head', value: 'edit_head', description: 'Change the head armor' },
                { label: 'Chest', value: 'edit_chest', description: 'Change the chest armor' },
                { label: 'Shoes', value: 'edit_shoes', description: 'Change the shoes' },
                { label: 'Food', value: 'edit_food', description: 'Change the food consumable' },
                { label: 'Potion', value: 'edit_potion', description: 'Change the potion consumable' },
                { label: 'Description', value: 'edit_description', description: 'Change the description' },
                { label: 'Cancel', value: 'edit_cancel', description: 'Cancel editing' }
            ];

            const editSelect = new StringSelectMenuBuilder()
                .setCustomId('build_edit_field_select')
                .setPlaceholder('Select what to edit')
                .addOptions(editOptions.map(option => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(option.label)
                        .setDescription(option.description)
                        .setValue(option.value)
                ));

            const row = new ActionRowBuilder().addComponents(editSelect);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`🔧 Editing: ${build.name}`)
                .setDescription('**Build editing from comp list**\n\nSelect what you would like to edit:')
                .addFields(
                    { name: 'Content Type', value: build.contentType || 'Not specified', inline: true },
                    { name: 'Weapon', value: build.weapon || 'Not specified', inline: true },
                    { name: 'Offhand', value: build.offhand || 'Not specified', inline: true },
                    { name: 'Cape', value: build.cape || 'Not specified', inline: true },
                    { name: 'Head', value: build.head || 'Not specified', inline: true },
                    { name: 'Chest', value: build.chest || 'Not specified', inline: true },
                    { name: 'Shoes', value: build.shoes || 'Not specified', inline: true },
                    { name: 'Food', value: build.food || 'Not specified', inline: true },
                    { name: 'Potion', value: build.potion || 'Not specified', inline: true },
                    { name: 'Description', value: build.description || 'Not specified', inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Build editing from comp' })
                .setTimestamp();

            await interaction.reply({ 
                embeds: [embed], 
                components: [row], 
                ephemeral: true 
            });
            console.log(`Build edit interface opened for: ${buildName} from comp list`);
            
        } catch (error) {
            console.error('Error in handleBuildEditFromComp:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while opening the build editor.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    generateCompProgressText(compData) {
        const fields = [
            { name: 'Comp Name', key: 'name', emoji: '📝' },
            { name: 'Content Type', key: 'contentType', emoji: '📄' },
            { name: 'Builds', key: 'builds', emoji: '⚔️' }
        ];

        return fields.map(field => {
            const value = compData[field.key];
            let status, displayValue;
            
            if (field.key === 'builds') {
                status = value && value.length > 0 ? '✅' : '❌';
                displayValue = value && value.length > 0 ? `${value.length} build(s) selected` : 'No builds selected';
            } else {
                status = value ? '✅' : '❌';
                displayValue = value || 'Not set';
            }
            
            return `${status} ${field.emoji} ${field.name}: ${displayValue}`;
        }).join('\n');
    },

    async finalizeComp(interaction, db, compData) {
        try {
            const userId = interaction.user.id;
            console.log(`Finalizing comp for user ${userId}`);
            console.log('Comp data to finalize:', compData);
            
            // Check if all required fields are filled
            if (!compData.name) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Missing Required Fields')
                    .setDescription('Please fill in the comp name.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }

            if (compData.builds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ No Builds Selected')
                    .setDescription('Please add at least one build to the comp.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }

            // Add metadata
            compData.createdBy = interaction.user.id;
            compData.createdAt = new Date();

            console.log('Final comp data with metadata:', compData);

            // Save to database (you'll need to implement this method in database.js)
            const success = await db.addComp(interaction.guildId, compData);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                                    .setTitle('✅ Comp Created Successfully!')
                .setDescription(`**${compData.name}** has been added to your guild's comps!`)
                    .addFields(
                        { name: '📄 Content Type', value: compData.contentType, inline: true },
                        { name: '⚔️ Builds', value: compData.builds.length.toString(), inline: true },
                        { name: '📋 Build Order', value: compData.builds.map((build, index) => `${index + 1}. ${build}`).join('\n'), inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                // Clear the comp data
                interaction.client.compData.delete(userId);
                console.log(`Comp data cleared for user ${userId}`);
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Comp creation completed successfully');
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                                    .setTitle('❌ Failed to Create Comp')
                .setDescription('Failed to create comp. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({ embeds: [embed], components: [] });
                console.log('Comp creation failed in database');
            }
        } catch (error) {
            console.error('Error in finalizeComp:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Creating Comp')
                .setDescription('An unexpected error occurred while creating the comp. Please try again.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            try {
                await interaction.update({ embeds: [embed], components: [] });
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async cancelComp(interaction) {
        const userId = interaction.user.id;
        interaction.client.compData.delete(userId);

        const embed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('❌ Comp Creation Cancelled')
            .setDescription('Comp creation has been cancelled. All data has been cleared.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });
    },

    async handleList(interaction, db) {
        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types for comp list:', contentTypes);

        // Ensure content types are unique and filter out any duplicates
        const uniqueContentTypes = [...new Set(contentTypes)].filter(ct => ct && typeof ct === 'string' && ct.trim() !== '');
        console.log('Unique content types after filtering:', uniqueContentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('comp_list_content_type_select')
            .setPlaceholder('Select content type to view comps')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('All Comps')
                    .setDescription('Show all comps regardless of content type')
                    .setValue('all')
                    .setEmoji('📋'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('Show only general comps')
                    .setValue('General')
                    .setEmoji('📄'),
                ...uniqueContentTypes.filter(ct => ct !== 'General').map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Show comps for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('📋 Comp List')
            .setDescription('**Step 1:** Select a content type from the dropdown below to see comps for that type.\n**Step 2:** After selecting content type, pick a comp from the dropdown to view details.\n\n💡 **Tip:** Choose "All Comps" to see every comp regardless of content type!')
            .addFields(
                { name: '📊 Current Filter', value: 'No content type selected yet', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Select content type first, then pick a comp from that type' })
            .setTimestamp();

        // Store list data temporarily
        const listData = {
            contentType: null,
            compName: null,
            contentTypes: contentTypes
        };
        interaction.client.compListData = interaction.client.compListData || new Map();
        interaction.client.compListData.set(interaction.user.id, listData);

        await interaction.reply({
            embeds: [embed],
            components: [contentTypeRow],
            ephemeral: true
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
            // Check if user has comp permission directly
            try {
                const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'comp');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct comp permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have comp permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'comp');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has comp permission through role: ${role.name}`);
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
                .setDescription('You do not have permission to delete comps.\n\n**Required:** Administrator role or comp permission')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get available content types for the dropdown
        const contentTypes = await db.getContentTypes(interaction.guildId);
        console.log('Available content types for comp delete:', contentTypes);

        // Ensure content types are unique and filter out any duplicates
        const uniqueContentTypes = [...new Set(contentTypes)].filter(ct => ct && typeof ct === 'string' && ct.trim() !== '');
        console.log('Unique content types after filtering:', uniqueContentTypes);

        // Create content type dropdown
        const contentTypeSelect = new StringSelectMenuBuilder()
            .setCustomId('comp_delete_content_type_select')
            .setPlaceholder('Select content type to delete comps')
            .addOptions([

                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('Delete only general comps')
                    .setValue('General')
                    .setEmoji('📄'),
                ...uniqueContentTypes.filter(ct => ct !== 'General').map(ct => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(ct)
                        .setDescription(`Delete comps for ${ct}`)
                        .setValue(ct)
                        .setEmoji('🎯')
                )
            ]);

        const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🗑️ Comp Deletion')
            .setDescription('**Step 1:** Select a content type from the dropdown below to see comps for that type.\n**Step 2:** After selecting content type, pick a comp to delete.\n**Step 3:** Confirm the deletion to proceed.')
            .addFields(
                { name: '📊 Current Filter', value: 'No content type selected yet', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot • Select content type first, then pick a comp from that type' })
            .setTimestamp();

        // Store delete data temporarily
        const deleteData = {
            contentType: null,
            compName: null,
            contentTypes: contentTypes
        };
        interaction.client.compDeleteData = interaction.client.compDeleteData || new Map();
        interaction.client.compDeleteData.set(interaction.user.id, deleteData);

        await interaction.reply({
            embeds: [embed],
            components: [contentTypeRow],
            ephemeral: true
        });
    },

    async ensureMigration(guildId, db, client) {
        try {
            // Check if migration has already been run for this guild
            const migrationKey = `migration_${guildId}`;
            if (client.migrationStatus?.get(migrationKey)) {
                return; // Migration already completed
            }

            console.log(`Checking if migration is needed for guild ${guildId}...`);
            
            // Run migration
            const success = await db.migrateAllLegacyData(guildId);
            
            if (success) {
                // Mark migration as completed
                if (!client.migrationStatus) {
                    client.migrationStatus = new Map();
                }
                client.migrationStatus.set(migrationKey, true);
                console.log(`Migration completed for guild ${guildId}`);
            }
        } catch (error) {
            console.error('Error during migration check:', error);
        }
    },

    async handleListInteraction(interaction, db) {
        try {
            const userId = interaction.user.id;
            
            // Ensure compListData Map exists
            if (!interaction.client.compListData) {
                interaction.client.compListData = new Map();
            }
            
            const listData = interaction.client.compListData.get(userId) || {};

            console.log(`Comp list interaction: ${interaction.customId} by user ${userId}`);

            // Run migration for this guild if needed
            await this.ensureMigration(interaction.guildId, db, interaction.client);

            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'comp_list_content_type_select') {
                    const selectedContentType = interaction.values[0];
                    console.log('Content type selected for comp list:', selectedContentType);
                    
                    listData.contentType = selectedContentType;
                    interaction.client.compListData.set(userId, listData);

                    // Get comps based on selection
                    let comps;
                    if (selectedContentType === 'all') {
                        // Get all comps regardless of content type
                        comps = await db.getComps(interaction.guildId, 'all');
                    } else {
                        // Get comps filtered by content type
                        comps = await db.getComps(interaction.guildId, selectedContentType);
                    }

                    console.log(`Retrieved ${comps.length} comps for content type: ${selectedContentType}`);
                    console.log('Comps data:', comps);

                    // Filter out any documents that don't have a name field (safety check)
                    const validComps = comps.filter(comp => comp.name && typeof comp.name === 'string');
                    console.log(`Filtered to ${validComps.length} valid comps`);

                    // Create the comps display embed
                    const embed = await this.createCompsDisplayEmbed(validComps, selectedContentType);
                    
                    // Create a comp name dropdown if there are comps available
                    let compNameRow = null;
                    if (validComps.length > 0) {
                        const compNameSelect = new StringSelectMenuBuilder()
                            .setCustomId('comp_list_name_select')
                            .setPlaceholder('Select a comp to view details')
                            .addOptions(
                                validComps.map((comp, index) => 
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(comp.name)
                                        .setDescription(`${comp.builds.length} builds | ${comp.contentType}`)
                                        .setValue(`${comp.name}_${index}`)
                                        .setEmoji('🎭')
                                )
                            );

                        compNameRow = new ActionRowBuilder().addComponents(compNameSelect);
                    }

                    // Combine all components - only show comp name dropdown, remove content type dropdown
                    const components = [];
                    if (compNameRow) {
                        components.push(compNameRow);
                    }
                    
                    // Update the original message with comps and comp name selection
                    try {
                        await interaction.update({
                            embeds: [embed],
                            components: components
                        });
                        console.log('Comp list updated successfully with comps and comp name selection');
                    } catch (error) {
                        console.error('Error updating comp list message:', error);
                        // Try to send a follow-up message with the proper embed
                        try {
                            await interaction.followUp({
                                embeds: [embed],
                                components: components,
                                ephemeral: true
                            });
                        } catch (followUpError) {
                            console.error('Error sending follow-up message:', followUpError);
                            // If follow-up fails, try to reply instead
                            try {
                                await interaction.reply({
                                    embeds: [embed],
                                    components: components,
                                    ephemeral: true
                                });
                            } catch (replyError) {
                                console.error('Error sending reply message:', replyError);
                            }
                        }
                    }
                    return;
                } else if (interaction.customId === 'comp_list_name_select') {
                    // Handle comp name selection
                    const selectedValue = interaction.values[0];
                    console.log('Comp value selected:', selectedValue);
                    
                    // Extract the actual comp name from the value (remove the index suffix)
                    const selectedCompName = selectedValue.split('_').slice(0, -1).join('_');
                    console.log('Extracted comp name:', selectedCompName);
                    
                    // Get the specific comp details
                    let comps;
                    if (listData.contentType === 'all') {
                        comps = await db.getComps(interaction.guildId, 'all');
                    } else {
                        comps = await db.getComps(interaction.guildId, listData.contentType);
                    }
                    
                    if (comps.length > 0) {
                        const selectedComp = comps.find(comp => comp.name === selectedCompName);
                        
                        if (selectedComp) {
                            // Create detailed comp view embed
                            const detailedEmbed = new EmbedBuilder()
                                .setColor('#9B59B6')
                                .setTitle(`🎭 ${selectedComp.name}`)
                                .setDescription(`**Comp Information, Click button to see build details**`)
                                .addFields(
                                    { name: '📄 Content Type', value: selectedComp.contentType, inline: true },
                                    { name: '⚔️ Total Builds', value: selectedComp.builds.length.toString(), inline: true },
                                    { name: '📋 Build Order', value: selectedComp.builds.map((build, index) => `${index + 1}. ${build}`).join('\n'), inline: false }
                                )
                                .setFooter({ text: 'Phoenix Assistance Bot' })
                                .setTimestamp();
                            
                            // Add creation info if available
                            if (selectedComp.createdAt) {
                                const createdDate = new Date(selectedComp.createdAt).toLocaleDateString();
                                detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
                            }
                            
                            // Get the actual build details for this comp
                            const compBuilds = await db.getCompBuilds(interaction.guildId, selectedComp.compId);
                            console.log(`Found ${compBuilds.length} builds for comp ${selectedComp.name} (ID: ${selectedComp.compId})`);
                            
                            // Check if build details are viewable (lockView field)
                            const isViewable = selectedComp.lockView !== false; // Default to true if not set
                            console.log(`Comp "${selectedComp.name}" lockView: ${selectedComp.lockView}, isViewable: ${isViewable}`);
                            
                            let buildButtons = [];
                            
                            if (isViewable) {
                                // Create build detail buttons for each build using build IDs
                                const buildsPerRow = 4; // Show 4 builds per row
                                const maxRows = 5; // Discord limit
                                const maxBuilds = maxRows * buildsPerRow; // 20 builds maximum
                                
                                // If we have more builds than can fit, truncate and add a note
                                const buildsToShow = compBuilds.slice(0, maxBuilds);
                                
                                for (let i = 0; i < buildsToShow.length; i += buildsPerRow) {
                                    const row = new ActionRowBuilder();
                                    const rowBuilds = buildsToShow.slice(i, i + buildsPerRow);
                                    
                                    rowBuilds.forEach((build, rowIndex) => {
                                        const globalIndex = i + rowIndex; // Global index across all rows
                                        const button = new ButtonBuilder()
                                            .setCustomId(`comp_build_detail_${build.buildId}`)
                                            .setLabel(`${globalIndex + 1}. ${build.name}`)
                                            .setStyle(ButtonStyle.Secondary)
                                            .setEmoji('⚔️');
                                        row.addComponents(button);
                                    });
                                    
                                    buildButtons.push(row);
                                }
                                
                                // If we had to truncate, add a note about it
                                if (selectedComp.builds.length > maxBuilds) {
                                    console.warn(`Too many builds (${selectedComp.builds.length}) for comp detail interface. Showing only first ${maxBuilds} builds.`);
                                }
                            } else {
                                // Build details are locked - add a note to the embed
                                detailedEmbed.addFields({
                                    name: '🔒 Build Details Locked',
                                    value: 'Build details are not available for this composition.',
                                    inline: false
                                });
                            }
                            
                            // Update the message with detailed comp view and build detail buttons (if viewable)
                            await interaction.update({
                                embeds: [detailedEmbed],
                                components: buildButtons
                            });
                            console.log('Comp details displayed successfully with build detail buttons');
                        } else {
                            await interaction.update({
                                content: `❌ Comp "${selectedCompName}" not found.`,
                                ephemeral: true
                            });
                        }
                    } else {
                        await interaction.update({
                            content: `❌ Comp "${selectedCompName}" not found.`,
                            ephemeral: true
                        });
                    }
                    return;
                }
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
            
            // Ensure compDeleteData Map exists
            if (!interaction.client.compDeleteData) {
                interaction.client.compDeleteData = new Map();
            }
            
            const deleteData = interaction.client.compDeleteData.get(userId) || {};

            console.log(`Comp delete interaction: ${interaction.customId} by user ${userId}`);

            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'comp_delete_content_type_select') {
                    const selectedContentType = interaction.values[0];
                    console.log('Content type selected for comp delete:', selectedContentType);
                    
                    deleteData.contentType = selectedContentType;
                    interaction.client.compDeleteData.set(userId, deleteData);

                    // Get comps based on selection
                    let comps = await db.getComps(interaction.guildId, selectedContentType);

                    // Create the comps display embed
                    const embed = await this.createCompsDisplayEmbed(comps, selectedContentType);
                    
                    // Update the original message with comps and comp name selection
                    try {
                        // Create a comp name dropdown if there are comps available
                        let compNameRow = null;
                        if (comps.length > 0) {
                            const compNameSelect = new StringSelectMenuBuilder()
                                .setCustomId('comp_delete_name_select')
                                .setPlaceholder('Select a composition to delete')
                                .addOptions(
                                    comps.map((comp, index) => 
                                        new StringSelectMenuOptionBuilder()
                                            .setLabel(comp.name)
                                            .setDescription(`${comp.builds.length} builds | ${comp.contentType}`)
                                            .setValue(`${comp.name}_${index}`)
                                            .setEmoji('🎭')
                                    )
                                );

                            compNameRow = new ActionRowBuilder().addComponents(compNameSelect);
                        }

                        // Combine all components - only show comp name dropdown
                        const components = [];
                        if (compNameRow) {
                            components.push(compNameRow);
                        }
                        
                        await interaction.update({
                            embeds: [embed],
                            components: components
                        });
                        console.log('Comp delete updated successfully with comps and comp name selection');
                    } catch (error) {
                        console.error('Error updating comp delete message:', error);
                        await interaction.followUp({
                            content: `✅ Showing comps for: ${selectedContentType}`,
                            ephemeral: true
                        });
                    }
                    return;
                } else if (interaction.customId === 'comp_delete_name_select') {
                    // Handle comp name selection
                    const selectedValue = interaction.values[0];
                    console.log('Comp value selected for delete:', selectedValue);
                    
                    // Extract the actual comp name from the value (remove the index suffix)
                    const selectedCompName = selectedValue.split('_').slice(0, -1).join('_');
                    console.log('Extracted comp name for delete:', selectedCompName);
                    
                    // Update the deleteData with the selected comp name
                    deleteData.compName = selectedCompName;
                    interaction.client.compDeleteData.set(userId, deleteData);
                    console.log('Updated deleteData with comp name:', deleteData);
                    
                    // Get the specific comp details
                    let comps = await db.getComps(interaction.guildId, deleteData.contentType);
                    
                    if (comps.length > 0) {
                        const selectedComp = comps.find(comp => comp.name === selectedCompName);
                        
                        if (selectedComp) {
                            // Create detailed comp view embed for deletion
                            const detailedEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle(`🗑️ ${selectedComp.name}`)
                                .setDescription(`**Comp Information - Ready for Deletion**`)
                                .addFields(
                                    { name: '📄 Content Type', value: selectedComp.contentType, inline: true },
                                    { name: '⚔️ Total Builds', value: selectedComp.builds.length.toString(), inline: true },
                                    { name: '📋 Build Order', value: selectedComp.builds.map((build, index) => `${index + 1}. ${build}`).join('\n'), inline: false }
                                )
                                .setFooter({ text: 'Phoenix Assistance Bot • Confirm deletion below' })
                                .setTimestamp();
                            
                            // Add creation info if available
                            if (selectedComp.createdAt) {
                                const createdDate = new Date(selectedComp.createdAt).toLocaleDateString();
                                detailedEmbed.addFields({ name: '📅 Created', value: createdDate, inline: true });
                            }
                            
                            // Create confirm and cancel buttons
                            const actionButtons = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('comp_confirm_delete')
                                        .setLabel('🗑️ Confirm Delete')
                                        .setStyle(ButtonStyle.Danger),
                                    new ButtonBuilder()
                                        .setCustomId('comp_cancel_delete')
                                        .setLabel('❌ Cancel')
                                        .setStyle(ButtonStyle.Secondary)
                                );
                            
                            // Update the message with detailed comp view and action buttons
                            await interaction.update({
                                embeds: [detailedEmbed],
                                components: [actionButtons]
                            });
                            console.log('Comp details displayed successfully for deletion with action buttons');
                        } else {
                            await interaction.update({
                                content: `❌ Comp "${selectedCompName}" not found.`,
                                ephemeral: true
                            });
                        }
                    } else {
                        await interaction.update({
                            content: `❌ Comp "${selectedCompName}" not found.`,
                            ephemeral: true
                        });
                    }
                    return;
                }
            }

            if (interaction.isButton()) {
                if (interaction.customId === 'comp_confirm_delete') {
                    await this.handleConfirmDelete(interaction, db);
                } else if (interaction.customId === 'comp_cancel_delete') {
                    await this.handleCancelDelete(interaction);
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

    async handleConfirmDelete(interaction, db) {
        try {
            const userId = interaction.user.id;
            const deleteData = interaction.client.compDeleteData?.get(userId) || {};
            const compName = deleteData.compName;
            const contentType = deleteData.contentType;

            console.log(`Delete confirmation received - Content Type: ${contentType}, Name: ${compName}, User: ${userId}`);

            if (!compName) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                                    .setTitle('⚠️ No Comp Selected')
                .setDescription('Please select a comp first before confirming deletion.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Delete the comp from the database
            const success = await db.deleteComp(interaction.guildId, compName);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                                    .setTitle('✅ Comp Deleted Successfully!')
                .setDescription(`**${compName}** has been removed from your guild's comps.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Comp deletion completed successfully');
                
                // Clear the stored data
                interaction.client.compDeleteData.delete(userId);
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                                    .setTitle('❌ Failed to Delete Comp')
                .setDescription('Failed to delete comp. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                console.log('Comp deletion failed in database');
            }
        } catch (error) {
            console.error('Error in handleConfirmDelete:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Deleting Comp')
                .setDescription('An unexpected error occurred while deleting the comp. Please try again.')
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

    async handleCancelDelete(interaction) {
        const userId = interaction.user.id;
        interaction.client.compDeleteData.delete(userId);

        const embed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('❌ Composition Deletion Cancelled')
            .setDescription('Composition deletion has been cancelled. All data has been cleared.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.update({
            embeds: [embed],
            components: []
        });
    },

    async createCompsDisplayEmbed(comps, contentType) {
        if (comps.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('📋 Comps')
                .setDescription('No comps found matching your criteria.')
                .addFields(
                    { name: '💡 Tip', value: 'Use `/comp create` to add your first comp!', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            if (contentType && contentType !== 'all') {
                embed.addFields({ name: '🔍 Current Filter', value: `Content Type: ${contentType}`, inline: true });
            } else if (contentType === 'all') {
                embed.addFields({ name: '🔍 Current Filter', value: 'All Content Types', inline: true });
            }

            return embed;
        }

        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
                            .setTitle('📋 Available Comps')
                            .setDescription(`Found **${comps.length}** comp(s):`)
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        // Add filter information
        if (contentType && contentType !== 'all') {
            embed.addFields({ name: '🔍 Content Type Filter', value: contentType, inline: true });
        } else if (contentType === 'all') {
            embed.addFields({ name: '🔍 Current Filter', value: 'All Content Types', inline: true });
        }

        // Split comps into chunks to avoid embed field limit
        const chunks = this.chunkArray(comps, 10);
        
        chunks.forEach((chunk, index) => {
            const compList = chunk.map(comp => 
                `• **${comp.name}** (${comp.builds.length} builds)`
            ).join('\n');

            embed.addFields({
                name: `Choose Comp to show Details`,
                value: compList,
                inline: false
            });
        });

        return embed;
    },

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    async handleLock(interaction, db) {
        try {
            // Defer the reply immediately to prevent timeout
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: true });
            }

            // Check if user has permission
            const member = interaction.member;
            let hasPermission = false;
            
            // Check if user is admin (fastest check first)
            if (member.permissions.has('Administrator')) {
                hasPermission = true;
                console.log(`User ${interaction.user.id} has Administrator permission`);
            } else {
                // Check if user has comp permission directly
                try {
                    const userHasPermission = await db.hasPermission(interaction.guildId, member.id, 'comp');
                    if (userHasPermission) {
                        hasPermission = true;
                        console.log(`User ${interaction.user.id} has direct comp permission`);
                    }
                } catch (error) {
                    console.error('Error checking user permission:', error);
                }
                
                // Check if any of user's roles have comp permission
                if (!hasPermission) {
                    for (const role of member.roles.cache.values()) {
                        try {
                            const roleHasPermission = await db.hasPermission(interaction.guildId, role.id, 'comp');
                            if (roleHasPermission) {
                                hasPermission = true;
                                console.log(`User ${interaction.user.id} has comp permission through role: ${role.name}`);
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
                    .setDescription('You do not have permission to manage comp lock settings.\n\n**Required:** Administrator role or comp permission')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            // Get available content types for the dropdown
            const contentTypes = await db.getContentTypes(interaction.guildId);
            console.log('Available content types for comp lock:', contentTypes);

            // Ensure content types are unique and filter out any duplicates
            const uniqueContentTypes = [...new Set(contentTypes)].filter(ct => ct && typeof ct === 'string' && ct.trim() !== '');
            console.log('Unique content types after filtering:', uniqueContentTypes);

            // Create content type dropdown
            const contentTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('comp_lock_content_type_select')
                .setPlaceholder('Select content type to manage comp locks')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('All Comps')
                        .setDescription('Manage locks for all comps')
                        .setValue('all')
                        .setEmoji('📋'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('General')
                        .setDescription('Manage locks for general comps')
                        .setValue('General')
                        .setEmoji('📄'),
                    ...uniqueContentTypes.filter(ct => ct !== 'General').map(ct => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(ct)
                            .setDescription(`Manage locks for ${ct} comps`)
                            .setValue(ct)
                            .setEmoji('🎯')
                    )
                ]);

            const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

            // Create the main embed
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('🔒 Comp Lock Management')
                .setDescription('**Step 1:** Select a content type to see comps for lock management.\n**Step 2:** After selecting content type, pick a comp to toggle its lock status.\n\n💡 **Tip:** Locked comps hide build details from users!')
                .addFields(
                    { name: '📊 Current Filter', value: 'No content type selected yet', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Select content type first, then pick a comp from that type' })
                .setTimestamp();

            // Store lock data temporarily
            const lockData = {
                contentType: null,
                compName: null,
                contentTypes: contentTypes
            };
            interaction.client.compLockData = interaction.client.compLockData || new Map();
            interaction.client.compLockData.set(interaction.user.id, lockData);

            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed],
                    components: [contentTypeRow]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [embed],
                    components: [contentTypeRow],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in handleLock:', error);
            
            // Try to send error message
            try {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('An error occurred while setting up comp lock management.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async handleLockInteraction(interaction, db) {
        try {
            if (!interaction.client.compLockData) {
                interaction.client.compLockData = new Map();
            }

            const lockData = interaction.client.compLockData.get(interaction.user.id);
            if (!lockData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Session Expired')
                    .setDescription('Your lock management session has expired. Please use `/comp lock` again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            const selectedContentType = interaction.values[0];
            console.log('Content type selected for comp lock:', selectedContentType);

            // Update lock data
            lockData.contentType = selectedContentType;
            interaction.client.compLockData.set(interaction.user.id, lockData);

            // Get comps for the selected content type
            let comps;
            if (selectedContentType === 'all') {
                comps = await db.getComps(interaction.guildId, 'all');
            } else {
                comps = await db.getComps(interaction.guildId, selectedContentType);
            }

            console.log('Found comps for lock management:', comps);

            if (!comps || comps.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ No Comps Found')
                    .setDescription(`No comps found for content type: ${selectedContentType === 'all' ? 'All Comps' : selectedContentType}`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            // Create comp selection dropdown
            const compSelect = new StringSelectMenuBuilder()
                .setCustomId('comp_lock_comp_select')
                .setPlaceholder('Select a comp to toggle lock status')
                .setMinValues(1)
                .setMaxValues(1);

            // Filter out invalid comps and add to dropdown
            const validComps = comps.filter(comp => comp && comp.name && typeof comp.name === 'string');
            validComps.forEach(comp => {
                const lockStatus = comp.lockView === false ? '🔒 Locked' : '🔓 Unlocked';
                compSelect.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${comp.name} (${lockStatus})`)
                        .setValue(comp.name)
                        .setDescription(`Toggle lock status for ${comp.name}`)
                        .setEmoji(comp.lockView === false ? '🔒' : '🔓')
                );
            });

            const compRow = new ActionRowBuilder().addComponents(compSelect);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('🔒 Comp Lock Management')
                .setDescription('**Step 2:** Select a comp to toggle its lock status.\n\n💡 **Tip:** Locked comps hide build details from users!')
                .addFields(
                    { name: '📊 Current Filter', value: selectedContentType === 'all' ? 'All Comps' : selectedContentType, inline: false },
                    { name: '📋 Available Comps', value: `${validComps.length} comp(s) found`, inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Select a comp to toggle its lock status' })
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed],
                    components: [compRow]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [embed],
                    components: [compRow],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in handleLockInteraction:', error);
            
            try {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('An error occurred while processing the comp lock selection.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    },

    async handleLockCompSelection(interaction, db) {
        try {
            if (!interaction.client.compLockData) {
                interaction.client.compLockData = new Map();
            }

            const lockData = interaction.client.compLockData.get(interaction.user.id);
            if (!lockData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Session Expired')
                    .setDescription('Your lock management session has expired. Please use `/comp lock` again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            const selectedCompName = interaction.values[0];
            console.log('Comp selected for lock toggle:', selectedCompName);

            // Get the comp to check current lock status
            let comps;
            if (lockData.contentType === 'all') {
                comps = await db.getComps(interaction.guildId, 'all');
            } else {
                comps = await db.getComps(interaction.guildId, lockData.contentType);
            }

            const selectedComp = comps.find(comp => comp.name === selectedCompName);
            if (!selectedComp) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Comp Not Found')
                    .setDescription(`Comp "${selectedCompName}" not found.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            // Toggle the lock status
            const newLockStatus = selectedComp.lockView === false ? true : false;
            
            // Update the comp in the database
            await db.updateCompLockView(interaction.guildId, selectedCompName, newLockStatus);

            // Create success embed
            const embed = new EmbedBuilder()
                .setColor(newLockStatus ? '#00FF00' : '#FFAA00')
                .setTitle('✅ Lock Status Updated')
                .setDescription(`**${selectedCompName}** lock status has been ${newLockStatus ? 'unlocked' : 'locked'}.`)
                .addFields(
                    { name: '📋 Comp Name', value: selectedCompName, inline: true },
                    { name: '🔒 Lock Status', value: newLockStatus ? '🔓 Unlocked' : '🔒 Locked', inline: true },
                    { name: '📊 Content Type', value: lockData.contentType === 'all' ? 'All Comps' : lockData.contentType, inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot • Use /comp lock to manage more comps' })
                .setTimestamp();

            // Clear the lock data
            interaction.client.compLockData.delete(interaction.user.id);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else if (!interaction.replied) {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in handleLockCompSelection:', error);
            
            try {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('An error occurred while updating the comp lock status.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }
};
