const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build-edit')
        .setDescription('Edit existing Albion Online builds interactively'),

    async execute(interaction, db) {
        try {
            await this.handleBuildSelection(interaction, db);
        } catch (error) {
            console.error('Error in build-edit command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the build edit command.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleBuildSelection(interaction, db) {
        try {
            // Check if guild is registered first
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ Guild Not Registered')
                    .setDescription('This guild must be registered first to use build editing features.\n\n**To get started:**\n1. Use `/guild-register [guild_name]` to register your guild\n2. Set up permissions with `/perms-add`\n3. Add content types with `/add-content`\n4. Create builds with `/build create`\n5. Then you can edit them with `/build-edit`')
                    .addFields(
                        { name: '💡 Tip', value: 'Only administrators can register guilds. Contact your server admin if you need help.', inline: false }
                    )
                    .setFooter({ text: 'Phoenix Assistance Bot • Guild registration required' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

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
                    .setDescription('You do not have permission to edit builds. Contact an administrator or someone with build permissions.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Get content types from the guild
            const guild = await db.getGuildCollection(interaction.guildId);
            const guildData = await guild.findOne({ guildId: interaction.guildId });
            const contentTypes = guildData?.contentTypes || [];

            // Create content type selection menu
            const contentTypeOptions = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('All Content Types')
                    .setDescription('Show builds from all content types')
                    .setValue('all'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('Show builds without specific content type')
                    .setValue('general')
            ];

            // Add content types from database
            contentTypes.forEach(contentType => {
                contentTypeOptions.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(contentType)
                        .setDescription(`Show builds for ${contentType}`)
                        .setValue(contentType)
                );
            });

            const contentTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('build_edit_content_type_select')
                .setPlaceholder('Select content type to filter builds')
                .addOptions(contentTypeOptions);

            const row = new ActionRowBuilder().addComponents(contentTypeSelect);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔧 Edit Build')
                .setDescription('First, select a content type to filter the builds you want to edit.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } catch (error) {
            console.error('Error in handleBuildSelection:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading content types.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async getAllBuildsForEdit(guildId, db) {
        try {
            // Get all builds from the guild document (both global and comp-specific)
            const collection = await db.getGuildCollection(guildId);
            const guild = await collection.findOne({ guildId: guildId });
            
            if (!guild || !guild.builds) {
                return [];
            }
            
            // Return all builds (both global and comp-specific)
            return guild.builds;
        } catch (error) {
            console.error('❌ Failed to get all builds for edit:', error);
            return [];
        }
    },

    async ensureMigration(guildId, db, client) {
        try {
            console.log(`Checking if migration is needed for guild ${guildId}...`);
            
            // Run migration (it will check database for completion status)
            const success = await db.migrateAllLegacyData(guildId);
            
            if (success) {
                console.log(`Migration completed for guild ${guildId}`);
            }
        } catch (error) {
            console.error('Error during migration check:', error);
        }
    },

    async handleContentTypeSelection(interaction, db) {
        try {
            // Run migration for this guild if needed
            await this.ensureMigration(interaction.guildId, db, interaction.client);
            
            const selectedContentType = interaction.values[0];
            
            console.log(`Build-edit: Selected content type: ${selectedContentType}`);
            
            // Get builds based on selected content type
            let builds;
            if (selectedContentType === 'all') {
                // For 'all', get all builds (both global and comp-specific)
                builds = await this.getAllBuildsForEdit(interaction.guildId, db);
                console.log(`Build-edit: Retrieved ${builds ? builds.length : 0} builds for 'all' content type`);
            } else if (selectedContentType === 'general') {
                // For general builds, get all builds and filter for those without content type or with empty content type
                builds = await this.getAllBuildsForEdit(interaction.guildId, db);
                builds = builds.filter(build => !build.contentType || build.contentType === '' || build.contentType === 'General');
                console.log(`Build-edit: Filtered to ${builds ? builds.length : 0} general builds`);
            } else {
                // For specific content types, get all builds and filter by content type
                builds = await this.getAllBuildsForEdit(interaction.guildId, db);
                builds = builds.filter(build => build.contentType === selectedContentType);
                console.log(`Build-edit: Filtered to ${builds ? builds.length : 0} builds for content type: ${selectedContentType}`);
            }
            
            if (!builds || builds.length === 0) {
                console.log(`Build-edit: No builds found for content type: ${selectedContentType}`);
                
                let description;
                if (selectedContentType === 'all') {
                    description = `No builds found in this guild.\n\n**To get started:**\n1. Use \`/build create\` to create your first build\n2. Then come back to \`/build-edit\` to edit it\n\n**Note:** Make sure your guild is registered and you have build permissions.`;
                } else if (selectedContentType === 'general') {
                    description = `No general builds found.\n\n**Tip:** Create some builds with \`/build create\` or check if you have builds with specific content types.`;
                } else {
                    description = `No builds found for content type: **${selectedContentType}**.\n\n**Tip:** Create some builds with this content type using \`/build create\` command.`;
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('⚠️ No Builds Found')
                    .setDescription(description)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Store the selected content type and pagination data for later use
            if (!interaction.client.editBuildData) {
                interaction.client.editBuildData = new Map();
            }
            interaction.client.editBuildData.set(interaction.user.id, { 
                selectedContentType,
                allBuilds: builds,
                currentPage: 0,
                buildsPerPage: 25
            });

            // Show the first page of builds
            await this.showBuildsPage(interaction, 0, db);
        } catch (error) {
            console.error('Error in handleContentTypeSelection:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading builds.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async showBuildsPage(interaction, page, db) {
        try {
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            if (!editData) {
                throw new Error('Edit data not found');
            }

            const { allBuilds, buildsPerPage, selectedContentType } = editData;
            const totalBuilds = allBuilds.length;
            const totalPages = Math.ceil(totalBuilds / buildsPerPage);
            const startIndex = page * buildsPerPage;
            const endIndex = Math.min(startIndex + buildsPerPage, totalBuilds);
            const currentBuilds = allBuilds.slice(startIndex, endIndex);

            console.log(`Build-edit: Showing page ${page + 1}/${totalPages}, builds ${startIndex + 1}-${endIndex} of ${totalBuilds} total builds`);

            // Create build options with unique values to handle duplicate names
            const buildOptions = await Promise.all(currentBuilds.map(async (build, index) => {
                const weapon = build.weapon || 'No weapon';
                const offhand = build.offhand || 'No offhand';
                const cape = build.cape || 'No cape';
                const head = build.head || 'No head';
                const chest = build.chest || 'No chest';
                const shoes = build.shoes || 'No shoes';
                const food = build.food || 'No food';
                const potion = build.potion || 'No potion';
                
                // Create a shorter description that fits within 100 characters
                let description = `${build.contentType || 'General'}`;
                
                // Add weapon if specified
                if (build.weapon) {
                    description += ` | ${weapon}`;
                }
                
                // Add offhand if specified
                if (build.offhand) {
                    description += ` | ${offhand}`;
                }
                
                // Add cape if specified
                if (build.cape) {
                    description += ` | ${cape}`;
                }
                
                // Add head if specified
                if (build.head) {
                    description += ` | ${build.head}`;
                }
                
                // Add chest if specified
                if (build.chest) {
                    description += ` | ${build.chest}`;
                }
                
                // Add shoes if specified
                if (build.shoes) {
                    description += ` | ${build.shoes}`;
                }
                
                // Add food if specified
                if (build.food) {
                    description += ` | ${build.food}`;
                }
                
                // Add potion if specified
                if (build.potion) {
                    description += ` | ${build.potion}`;
                }
                
                // If no equipment is specified, just show "No equipment"
                if (!build.weapon && !build.offhand && !build.cape && !build.head && !build.chest && !build.shoes && !build.food && !build.potion) {
                    description += ` | No equipment specified`;
                }
                
                // Add comp info
                if (build.compId) {
                    description += ` | Comp-specific`;
                } else {
                    description += ` | Global`;
                }
                
                // Ensure description doesn't exceed 100 characters
                if (description.length > 100) {
                    description = description.substring(0, 97) + '...';
                }
                
                // Create unique value using build index to handle duplicate names
                const value = `build_${startIndex + index}`;
                
                // Create label that shows comp name and if it's a duplicate
                let label = build.name;
                
                // Add comp name if it's a comp-specific build
                if (build.compId) {
                    const compName = await db.getCompNameById(interaction.guildId, build.compId);
                    if (compName) {
                        label = `${build.name} - ${compName}`;
                    }
                }
                
                const nameCount = currentBuilds.filter(b => b.name === build.name).length;
                if (nameCount > 1) {
                    const duplicateIndex = currentBuilds.slice(0, index + 1).filter(b => b.name === build.name).length;
                    if (build.compId) {
                        const compName = await db.getCompNameById(interaction.guildId, build.compId);
                        label = `${build.name} - ${compName || 'Unknown Comp'} (${duplicateIndex})`;
                    } else {
                        label = `${build.name} (${duplicateIndex})`;
                    }
                }
                
                return new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setDescription(description)
                    .setValue(value);
            }));

            const buildSelect = new StringSelectMenuBuilder()
                .setCustomId('build_edit_select')
                .setPlaceholder(`Select a build to edit (${startIndex + 1}-${endIndex} of ${totalBuilds})`)
                .addOptions(buildOptions);

            // Create pagination buttons
            const paginationButtons = [];
            
            if (page > 0) {
                paginationButtons.push(
                    new ButtonBuilder()
                        .setCustomId('build_edit_prev_page')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            if (page < totalPages - 1) {
                paginationButtons.push(
                    new ButtonBuilder()
                        .setCustomId('build_edit_next_page')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            const components = [new ActionRowBuilder().addComponents(buildSelect)];
            
            if (paginationButtons.length > 0) {
                components.push(new ActionRowBuilder().addComponents(paginationButtons));
            }

            let description = `Content Type: **${selectedContentType === 'all' ? 'All Content Types' : selectedContentType === 'general' ? 'General' : selectedContentType}**\n\nShowing builds ${startIndex + 1}-${endIndex} of ${totalBuilds} total builds.\n\nSelect a build from the menu below to edit its details.`;
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🔧 Edit Build')
                .setDescription(description)
                .setFooter({ text: `Phoenix Assistance Bot • Page ${page + 1} of ${totalPages}` })
                .setTimestamp();

            // Update the stored page
            editData.currentPage = page;
            interaction.client.editBuildData.set(interaction.user.id, editData);

            await interaction.update({ embeds: [embed], components: components });
        } catch (error) {
            console.error('Error in showBuildsPage:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading builds.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async handleBuildEditInteraction(interaction, db) {
        try {
            const selectedValue = interaction.values[0];
            
            // Extract build index from value (format: build_0, build_1, etc.)
            const buildIndex = parseInt(selectedValue.replace('build_', ''));
            
            console.log(`Build-edit: Selected value: ${selectedValue}, Build index: ${buildIndex}`);
            
            // Get the edit data to find the correct build
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            if (!editData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Build selection data not found. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }
            
            // Get all builds and find the one at the specified index
            let builds;
            if (editData.selectedContentType === 'all') {
                builds = await db.getBuilds(interaction.guildId);
            } else if (editData.selectedContentType === 'general') {
                builds = await db.getBuilds(interaction.guildId);
                builds = builds.filter(build => !build.contentType || build.contentType === '' || build.contentType === 'General');
            } else {
                builds = await db.getBuilds(interaction.guildId, editData.selectedContentType);
            }
            
            const build = builds[buildIndex];
            
            if (!build) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Build Not Found')
                    .setDescription('The selected build could not be found.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Store build data for editing (merge with existing content type data)
            const existingData = interaction.client.editBuildData?.get(interaction.user.id) || {};
            interaction.client.editBuildData.set(interaction.user.id, { 
                ...existingData, 
                build, 
                originalName: build.name 
            });

            // Create edit options menu
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

            // Get the updated edit data to check for comp context
            const updatedEditData = interaction.client.editBuildData?.get(interaction.user.id) || {};
            
            // Create description with comp context if available
            let description = 'Select what you would like to edit:';
            if (updatedEditData.fromComp && updatedEditData.compContentType) {
                description = `**Editing from comp with content type: ${updatedEditData.compContentType}**\n\nSelect what you would like to edit:`;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`🔧 Editing: ${build.name}`)
                .setDescription(description)
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
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Add comp context field if available
            if (updatedEditData.fromComp && updatedEditData.compContentType) {
                embed.addFields({ 
                    name: '🎭 Comp Context', 
                    value: `This build is being edited from a comp with content type: **${updatedEditData.compContentType}**`, 
                    inline: false 
                });
            }

            await interaction.update({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error in handleBuildEditInteraction:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading build details.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async handleFieldEditSelection(interaction, db) {
        try {
            const editType = interaction.values[0];
            
            if (editType === 'edit_cancel') {
                // Clear stored data
                if (interaction.client.editBuildData) {
                    interaction.client.editBuildData.delete(interaction.user.id);
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('❌ Edit Cancelled')
                    .setDescription('Build editing has been cancelled.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Get the stored build data
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            if (!editData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Build data not found. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Create appropriate modal based on edit type
            let modal;
            let title;
            let label;
            let placeholder;
            let defaultValue;

            switch (editType) {
                case 'edit_name':
                    title = 'Edit Build Name';
                    label = 'New Build Name';
                    placeholder = 'Enter the new build name';
                    defaultValue = editData.build.name;
                    break;
                case 'edit_content_type':
                    // For content type, we'll show a dropdown instead of modal
                    await this.showContentTypeDropdown(interaction, editData, db);
                    return;
                case 'edit_weapon':
                    title = 'Edit Weapon';
                    label = 'New Weapon';
                    placeholder = 'e.g., Great Fire Staff, Bloodletter';
                    defaultValue = editData.build.weapon || '';
                    break;
                case 'edit_offhand':
                    title = 'Edit Offhand';
                    label = 'New Offhand Item';
                    placeholder = 'e.g., Shield, Torch, Book';
                    defaultValue = editData.build.offhand || '';
                    break;
                case 'edit_cape':
                    title = 'Edit Cape';
                    label = 'New Cape';
                    placeholder = 'e.g., Thetford Cape, Morgana Cape, Undead Cape';
                    defaultValue = editData.build.cape || '';
                    break;
                case 'edit_head':
                    title = 'Edit Head Armor';
                    label = 'New Head Armor';
                    placeholder = 'e.g., Scholar Cowl, Guardian Helmet';
                    defaultValue = editData.build.head || '';
                    break;
                case 'edit_chest':
                    title = 'Edit Chest Armor';
                    label = 'New Chest Armor';
                    placeholder = 'e.g., Mercenary Jacket, Guardian Armor';
                    defaultValue = editData.build.chest || '';
                    break;
                case 'edit_shoes':
                    title = 'Edit Shoes';
                    label = 'New Shoes';
                    placeholder = 'e.g., Soldier Boots, Guardian Boots';
                    defaultValue = editData.build.shoes || '';
                    break;
                case 'edit_food':
                    title = 'Edit Food';
                    label = 'New Food Consumable';
                    placeholder = 'e.g., Beef Stew, Omelette';
                    defaultValue = editData.build.food || '';
                    break;
                case 'edit_potion':
                    title = 'Edit Potion';
                    label = 'New Potion Consumable';
                    placeholder = 'e.g., Healing Potion, Resistance Potion';
                    defaultValue = editData.build.potion || '';
                    break;
                case 'edit_description':
                    title = 'Edit Description';
                    label = 'New Description';
                    placeholder = 'Enter a description for this build';
                    defaultValue = editData.build.description || '';
                    break;
                default:
                    return interaction.update({ content: 'Invalid edit type selected.', ephemeral: true });
            }

            modal = new ModalBuilder()
                .setCustomId(`build_edit_modal_${editType}`)
                .setTitle(title);

            const input = new TextInputBuilder()
                .setCustomId('edit_value')
                .setLabel(label)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(placeholder)
                .setValue(defaultValue)
                .setRequired(true)
                .setMaxLength(1000);

            const inputRow = new ActionRowBuilder().addComponents(input);
            modal.addComponents(inputRow);

            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error in handleFieldEditSelection:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while preparing the edit form.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async handleEditModalSubmit(interaction, db) {
        try {
            const editType = interaction.customId.replace('build_edit_modal_', '');
            const newValue = interaction.fields.getTextInputValue('edit_value');

            // Get the stored build data
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            if (!editData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Build data not found. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Update the build data
            const updatedBuild = { ...editData.build };
            updatedBuild[this.getFieldName(editType)] = newValue;

            // Track composition updates for user feedback
            let updatedComps = 0;

            // If editing name, we need to handle it specially
            if (editType === 'edit_name') {
                // Update composition references before changing the build name
                updatedComps = await db.updateCompositionBuildReferences(interaction.guildId, editData.originalName, newValue);
                console.log(`Updated ${updatedComps} compositions with new build name: ${editData.originalName} -> ${newValue}`);
                
                // Delete old build and add new one
                await db.deleteBuild(interaction.guildId, editData.originalName);
                await db.addBuild(interaction.guildId, updatedBuild);
            } else {
                // Update existing build by ID
                const fieldName = this.getFieldName(editType);
                await db.updateBuildFieldById(interaction.guildId, editData.build.buildId, fieldName, newValue);
            }

            // Update the stored build data with the new value
            editData.build[this.getFieldName(editType)] = newValue;
            if (editType === 'edit_name') {
                editData.originalName = newValue; // Update the original name if we changed it
            }

            // Create edit options menu again
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

            // Show updated build info with success message in description
            let description = `✅ **${this.getFieldDisplayName(editType)}** updated to: **${newValue}**\n\nSelect what you would like to edit next:`;
            if (editData.fromComp && editData.compContentType) {
                description = `✅ **${this.getFieldDisplayName(editType)}** updated to: **${newValue}**\n\n**Comp Context:** ${editData.compContentType}\n\nSelect what you would like to edit next:`;
            }
            
            // Add information about composition updates if name was changed
            if (editType === 'edit_name' && updatedComps > 0) {
                description += `\n\n🎭 **Updated ${updatedComps} composition(s)** that referenced this build.`;
            }

            const updatedEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🔧 Editing: ${editData.build.name}`)
                .setDescription(description)
                .addFields(
                    { name: 'Content Type', value: editData.build.contentType || 'Not specified', inline: true },
                    { name: 'Weapon', value: editData.build.weapon || 'Not specified', inline: true },
                    { name: 'Offhand', value: editData.build.offhand || 'Not specified', inline: true },
                    { name: 'Cape', value: editData.build.cape || 'Not specified', inline: true },
                    { name: 'Head', value: editData.build.head || 'Not specified', inline: true },
                    { name: 'Chest', value: editData.build.chest || 'Not specified', inline: true },
                    { name: 'Shoes', value: editData.build.shoes || 'Not specified', inline: true },
                    { name: 'Food', value: editData.build.food || 'Not specified', inline: true },
                    { name: 'Potion', value: editData.build.potion || 'Not specified', inline: true },
                    { name: 'Description', value: editData.build.description || 'Not specified', inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Add comp context field if available
            if (editData.fromComp && editData.compContentType) {
                updatedEmbed.addFields({ 
                    name: '🎭 Comp Context', 
                    value: `This build is being edited from a comp with content type: **${editData.compContentType}**`, 
                    inline: false 
                });
            }

            await interaction.update({ 
                embeds: [updatedEmbed], 
                components: [row]
            });
        } catch (error) {
            console.error('Error in handleEditModalSubmit:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while updating the build.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    getFieldName(editType) {
        const fieldMap = {
            'edit_name': 'name',
            'edit_content_type': 'contentType',
            'edit_weapon': 'weapon',
            'edit_offhand': 'offhand',
            'edit_cape': 'cape',
            'edit_head': 'head',
            'edit_chest': 'chest',
            'edit_shoes': 'shoes',
            'edit_food': 'food',
            'edit_potion': 'potion',
            'edit_description': 'description'
        };
        return fieldMap[editType] || editType;
    },

    getFieldDisplayName(editType) {
        const displayMap = {
            'edit_name': 'Build Name',
            'edit_content_type': 'Content Type',
            'edit_weapon': 'Weapon',
            'edit_offhand': 'Offhand',
            'edit_cape': 'Cape',
            'edit_head': 'Head Armor',
            'edit_chest': 'Chest Armor',
            'edit_shoes': 'Shoes',
            'edit_food': 'Food',
            'edit_potion': 'Potion',
            'edit_description': 'Description'
        };
        return displayMap[editType] || editType;
    },

    async showContentTypeDropdown(interaction, editData, db) {
        try {
            // Get content types from the guild
            const guild = await db.getGuildCollection(interaction.guildId);
            const guildData = await guild.findOne({ guildId: interaction.guildId });
            const contentTypes = guildData?.contentTypes || [];

            // Create content type selection menu
            const contentTypeOptions = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('General')
                    .setDescription('General purpose build')
                    .setValue('General')
                    .setEmoji('📄')
            ];

            // Add content types from database
            contentTypes.forEach(contentType => {
                contentTypeOptions.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(contentType)
                        .setDescription(`Build for ${contentType}`)
                        .setValue(contentType)
                        .setEmoji('🎯')
                );
            });

            const contentTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('build_edit_content_type_edit_select')
                .setPlaceholder('Select new content type')
                .addOptions(contentTypeOptions);

            const row = new ActionRowBuilder().addComponents(contentTypeSelect);

            // Create description with comp context if available
            let description = 'Select the new content type for this build:';
            if (editData.fromComp && editData.compContentType) {
                description = `**Editing from comp with content type: ${editData.compContentType}**\n\nSelect the new content type for this build:`;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle(`🔧 Editing: ${editData.build.name}`)
                .setDescription(description)
                .addFields(
                    { name: 'Current Content Type', value: editData.build.contentType || 'General', inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Add comp context field if available
            if (editData.fromComp && editData.compContentType) {
                embed.addFields({ 
                    name: '🎭 Comp Context', 
                    value: `This build is being edited from a comp with content type: **${editData.compContentType}**`, 
                    inline: false 
                });
            }

            await interaction.update({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error showing content type dropdown:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while loading content types.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async handleContentTypeDropdownSelection(interaction, db) {
        try {
            const newContentType = interaction.values[0];
            
            // Get the stored build data
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            if (!editData) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Build data not found. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.update({ embeds: [embed], components: [] });
            }

            // Update the build's content type
            const fieldName = this.getFieldName('edit_content_type');
            await db.updateBuildFieldById(interaction.guildId, editData.build.buildId, fieldName, newContentType);

            // Update the stored build data
            editData.build.contentType = newContentType;

            // Create edit options menu again
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

            // Show updated build info with success message in description
            let description = `✅ **Content Type** updated to: **${newContentType}**\n\nSelect what you would like to edit next:`;
            if (editData.fromComp && editData.compContentType) {
                description = `✅ **Content Type** updated to: **${newContentType}**\n\n**Comp Context:** ${editData.compContentType}\n\nSelect what you would like to edit next:`;
            }

            const updatedEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🔧 Editing: ${editData.build.name}`)
                .setDescription(description)
                .addFields(
                    { name: 'Content Type', value: editData.build.contentType || 'Not specified', inline: true },
                    { name: 'Weapon', value: editData.build.weapon || 'Not specified', inline: true },
                    { name: 'Offhand', value: editData.build.offhand || 'Not specified', inline: true },
                    { name: 'Cape', value: editData.build.cape || 'Not specified', inline: true },
                    { name: 'Head', value: editData.build.head || 'Not specified', inline: true },
                    { name: 'Chest', value: editData.build.chest || 'Not specified', inline: true },
                    { name: 'Shoes', value: editData.build.shoes || 'Not specified', inline: true },
                    { name: 'Food', value: editData.build.food || 'Not specified', inline: true },
                    { name: 'Potion', value: editData.build.potion || 'Not specified', inline: true },
                    { name: 'Description', value: editData.build.description || 'Not specified', inline: true }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Add comp context field if available
            if (editData.fromComp && editData.compContentType) {
                updatedEmbed.addFields({ 
                    name: '🎭 Comp Context', 
                    value: `This build is being edited from a comp with content type: **${editData.compContentType}**`, 
                    inline: false 
                });
            }

            await interaction.update({ 
                embeds: [updatedEmbed], 
                components: [row] 
            });
        } catch (error) {
            console.error('Error handling content type dropdown selection:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while updating the content type.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [] });
        }
    },

    async handlePaginationButton(interaction, db) {
        try {
            const customId = interaction.customId;
            const editData = interaction.client.editBuildData?.get(interaction.user.id);
            
            if (!editData) {
                await interaction.reply({
                    content: '❌ Build selection data not found. Please try again.',
                    ephemeral: true
                });
                return;
            }

            let newPage = editData.currentPage;
            
            if (customId === 'build_edit_prev_page') {
                newPage = Math.max(0, editData.currentPage - 1);
            } else if (customId === 'build_edit_next_page') {
                const totalPages = Math.ceil(editData.allBuilds.length / editData.buildsPerPage);
                newPage = Math.min(totalPages - 1, editData.currentPage + 1);
            }

            await this.showBuildsPage(interaction, newPage, db);
        } catch (error) {
            console.error('Error handling pagination button:', error);
            await interaction.reply({
                content: '❌ An error occurred while changing pages. Please try again.',
                ephemeral: true
            });
        }
    }
};
