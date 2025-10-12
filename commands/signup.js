const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('signup')
        .setDescription('Interactive signup for builds from available comps'),

    async execute(interaction, db) {
        if (!db) {
            console.error('Database manager not found');
            await interaction.reply({
                content: '❌ Database connection error. Please try again later.',
                ephemeral: true
            });
            return;
        }

        // Initialize event signups storage if it doesn't exist
        if (!interaction.client.eventSignups) {
            interaction.client.eventSignups = new Map();
        }

        await this.handleInteractiveSignup(interaction, db);
    },

    async handleInteractiveSignup(interaction, db) {
        try {
            // Get available content types
            const contentTypes = await db.getContentTypes(interaction.guildId);
            console.log('Available content types for signup:', contentTypes);

            if (contentTypes.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📝 Build Signup')
                    .setDescription('No content types available for signup.\n\n**Required:** At least one content type must be configured.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Create content type selection dropdown
            const contentTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('signup_content_type_select')
                .setPlaceholder('Select content type')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('All Comps')
                        .setDescription('Show all comps regardless of content type')
                        .setValue('all')
                        .setEmoji('📋'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('General')
                        .setDescription('General purpose builds')
                        .setValue('General')
                        .setEmoji('📄'),
                    ...contentTypes.map(ct => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(ct)
                            .setDescription(`Builds for ${ct}`)
                            .setValue(ct)
                            .setEmoji('🎯')
                    )
                ]);

            const contentTypeRow = new ActionRowBuilder().addComponents(contentTypeSelect);

            // Create the main embed
            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('📝 Build Signup')
                .setDescription('**Step 1:** Choose a content type to see available comps and builds.\n\n💡 **Tip:** Choose "All Comps" to see every comp regardless of content type!')
                .setFooter({ text: 'Phoenix Assistance Bot • Step 1 of 2' })
                .setTimestamp();

            // Store signup data temporarily
            const signupData = {
                contentType: '',
                compName: '',
                createdBy: interaction.user.id,
                createdAt: new Date(),
                sessionId: this.generateSessionId() // Add unique session ID
            };

            interaction.client.signupData = interaction.client.signupData || new Map();
            interaction.client.signupData.set(interaction.user.id, signupData);

            await interaction.reply({
                embeds: [embed],
                components: [contentTypeRow],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in handleInteractiveSignup:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading content types. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleContentTypeSelection(interaction, db) {
        try {
            const userId = interaction.user.id;
            
            // Ensure signupData Map exists
            if (!interaction.client.signupData) {
                interaction.client.signupData = new Map();
            }
            
            const signupData = interaction.client.signupData.get(userId) || {};
            const selectedContentType = interaction.values[0];

            console.log(`Content type selected for signup: ${selectedContentType}`);
            
            // Update the signup data
            signupData.contentType = selectedContentType;
            interaction.client.signupData.set(userId, signupData);

            // Get available compositions for the selected content type
            let comps;
            if (selectedContentType === 'all') {
                // Get all comps regardless of content type
                comps = await db.getComps(interaction.guildId, 'all');
                console.log(`Retrieved ${comps.length} comps for 'all' content type`);
            } else if (selectedContentType === 'General') {
                comps = await db.getComps(interaction.guildId, null);
                console.log(`Retrieved ${comps.length} comps for 'General' content type`);
            } else {
                comps = await db.getComps(interaction.guildId, selectedContentType);
                console.log(`Retrieved ${comps.length} comps for '${selectedContentType}' content type`);
            }

            console.log('Retrieved comps:', comps);
            console.log('Comps array length:', comps?.length);
            
            // Filter out any documents that don't have a name field (safety check)
            const validComps = comps.filter(comp => comp && comp.name && typeof comp.name === 'string');
            console.log(`Filtered to ${validComps.length} valid comps`);
            
            // Validate comps data
            if (comps && Array.isArray(comps)) {
                comps.forEach((comp, index) => {
                    if (!comp || !comp.name || typeof comp.name !== 'string') {
                        console.warn(`Invalid comp at index ${index}:`, comp);
                    }
                });
            }

            if (validComps.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📝 Build Signup')
                    .setDescription(`No compositions found for **${selectedContentType}**.\n\nPlease try a different content type or contact an administrator.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                return;
            }

            // Create composition selection dropdown
            const compSelect = new StringSelectMenuBuilder()
                .setCustomId('signup_comp_select')
                .setPlaceholder('Select composition')
                .addOptions(
                    validComps.map(comp => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(comp.name)
                            .setDescription(`${comp.builds?.length || 0} builds | ${comp.contentType || 'Unknown'}`)
                            .setValue(comp.name)
                            .setEmoji('🎭')
                    )
                );

            const compRow = new ActionRowBuilder().addComponents(compSelect);

            // Create a new embed for step 2
            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('📝 Build Signup')
                .setDescription(`**Step 2:** Choose a comp to see available builds.\n\n**Content Type:** ${selectedContentType}`)
                .setFooter({ text: 'Phoenix Assistance Bot • Step 2 of 2' })
                .setTimestamp();

            await interaction.update({
                embeds: [embed],
                components: [compRow]
            });
            console.log('Message updated to composition selection');

        } catch (error) {
            console.error('Error handling content type selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing content type selection. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleCompSelection(interaction, db) {
        try {
            const userId = interaction.user.id;
            
            // Ensure signupData Map exists
            if (!interaction.client.signupData) {
                interaction.client.signupData = new Map();
            }
            
            const signupData = interaction.client.signupData.get(userId) || {};
            const selectedCompName = interaction.values[0];

            console.log(`Composition selected for signup: ${selectedCompName}`);
            
            // Update the signup data
            signupData.compName = selectedCompName;
            interaction.client.signupData.set(userId, signupData);

            // Get the composition details
            let selectedComp;
            if (signupData.contentType === 'all') {
                // Get all comps and find the selected one
                const allComps = await db.getComps(interaction.guildId, 'all');
                console.log(`Looking for comp '${selectedCompName}' in ${allComps.length} all comps`);
                if (allComps && Array.isArray(allComps)) {
                    selectedComp = allComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === selectedCompName);
                }
            } else if (signupData.contentType === 'General') {
                const generalComps = await db.getComps(interaction.guildId, null);
                console.log(`Looking for comp '${selectedCompName}' in ${generalComps.length} general comps`);
                if (generalComps && Array.isArray(generalComps)) {
                    selectedComp = generalComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === selectedCompName);
                }
            } else {
                const contentTypeComps = await db.getComps(interaction.guildId, signupData.contentType);
                console.log(`Looking for comp '${selectedCompName}' in ${contentTypeComps.length} '${signupData.contentType}' comps`);
                if (contentTypeComps && Array.isArray(contentTypeComps)) {
                    selectedComp = contentTypeComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === selectedCompName);
                }
            }
            
            console.log(`Selected comp found:`, selectedComp ? selectedComp.name : 'None');

            if (!selectedComp || !selectedComp.builds || selectedComp.builds.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('📝 Build Signup')
                    .setDescription(`No builds found in composition **${selectedCompName}**.\n\nPlease try a different composition.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();

                await interaction.update({
                    embeds: [embed],
                    components: []
                });
                return;
            }

            // Load existing signups for this composition from database
            await this.loadCompositionSignups(interaction, selectedCompName, db, signupData.sessionId);



            // Create build signup buttons
            const buttonRows = this.createBuildSignupButtons(selectedComp.builds, selectedCompName, interaction.client.eventSignups, userId, signupData.sessionId);

            // No need to update the ephemeral message - just send the public one

            // Calculate total signups for the count display
            let totalSignups = 0;
            for (let i = 0; i < selectedComp.builds.length; i++) {
                const signupKey = `comp_${selectedCompName}_${signupData.sessionId}_build_${i}`;
                const signups = interaction.client.eventSignups?.get(signupKey) || [];
                if (signups.length > 0) {
                    totalSignups++;
                }
            }
            const totalBuilds = selectedComp.builds.length;
            
            // Check if builds were truncated due to Discord's component limit
            const maxButtons = 20; // 5 rows × 4 buttons
            const buildsTruncated = totalBuilds > maxButtons;
            
            // Also send a public message to the channel so other users can see and interact with it
            const publicEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle(`📝 Build Signup - ${totalSignups}/${totalBuilds}`)
                .setDescription(`**${selectedCompName}** - Available Builds\n\n**Content Type:** ${signupData.contentType}`)
                .setFooter({ text: `Phoenix Assistance Bot • Click buttons below to sign up • Session: ${signupData.sessionId}` })
                .setTimestamp();

            // Add build list with current signups
            const publicBuildList = selectedComp.builds.map((build, index) => {
                const buildName = build.name || build;
                const signupKey = `comp_${selectedCompName}_${signupData.sessionId}_build_${index}`;
                const signups = interaction.client.eventSignups?.get(signupKey) || [];
                
                if (signups.length === 0) {
                    return `${index + 1}. **${buildName}** - *No signups*`;
                } else {
                    const userMentions = signups.map(id => `<@${id}>`).join(', ');
                    return `${index + 1}. **${buildName}** - ${userMentions}`;
                }
            }).join('\n');

            // Add build list fields, splitting into multiple fields if needed
            this.addBuildListFields(publicEmbed, publicBuildList);
            
            // Add note if builds were truncated due to Discord's component limit
            if (buildsTruncated) {
                publicEmbed.addFields({
                    name: '⚠️ **Note**',
                    value: `Due to Discord's interface limits, only the first ${maxButtons} builds are shown with signup buttons. All ${totalBuilds} builds are listed above.`,
                    inline: false
                });
            }

            // Send the public message to the channel
            await interaction.channel.send({
                embeds: [publicEmbed],
                components: buttonRows
            });

            // Clear the signup data since we're done
            interaction.client.signupData.delete(userId);

            // Update the ephemeral message to show success
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#4CAF50')
                        .setTitle('✅ Signup Created Successfully!')
                        .setDescription(`**${selectedCompName}** signup interface has been posted to the channel.\n\nOther users can now see and sign up for builds.`)
                        .setFooter({ text: 'Phoenix Assistance Bot' })
                        .setTimestamp()
                ],
                components: []
            });



            console.log('Signup interface displayed with build list and signup buttons');

        } catch (error) {
            console.error('Error handling composition selection:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing composition selection. Please try again.',
                ephemeral: true
            });
        }
    },

    // Helper method to load composition signups from database
    async loadCompositionSignups(interaction, compName, db, sessionId) {
        try {
            // Clear any existing signup data for this composition to prevent cross-session contamination
            const keysToDelete = [];
            for (const [key, value] of interaction.client.eventSignups.entries()) {
                if (key.startsWith(`comp_${compName}_`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => interaction.client.eventSignups.delete(key));
            
            if (keysToDelete.length > 0) {
                console.log(`Cleared ${keysToDelete.length} existing signup entries for composition: ${compName}`);
            }

            // Load existing signups from database for this composition and session
            const existingSignups = await db.getCompositionSignups(interaction.guildId, compName, sessionId);
            existingSignups.forEach((signups, key) => {
                interaction.client.eventSignups.set(key, signups);
            });

            console.log(`Loaded ${existingSignups.size} signup entries for composition: ${compName}, session: ${sessionId}`);
        } catch (error) {
            console.error('Error loading composition signups:', error);
        }
    },

    // Create build sign-up buttons for the composition
    createBuildSignupButtons(builds, compName, eventSignups = null, currentUserId = null, sessionId = null) {
        const buttons = [];
        
        // Validate inputs
        if (!builds || !Array.isArray(builds) || builds.length === 0) {
            console.warn('Invalid builds array provided to createBuildSignupButtons:', builds);
            return [];
        }
        
        if (!compName || typeof compName !== 'string') {
            console.warn('Invalid compName provided to createBuildSignupButtons:', compName);
            return [];
        }
        
        builds.forEach((build, index) => {
            const signupKey = `comp_${compName}_${sessionId}_build_${index}`;
            const signups = eventSignups?.get(signupKey) || [];
            const isTaken = signups.length > 0;
            const isTakenByCurrentUser = isTaken && currentUserId && signups.includes(currentUserId);
            
            // Use build number (index + 1) instead of build name for button label
            const buildNumber = index + 1;
            
            let buttonLabel = `${buildNumber}`;
            
            const button = new ButtonBuilder()
                .setCustomId(`signup_comp_${compName}_${sessionId}_${index}`)
                .setLabel(buttonLabel)
                .setStyle(isTaken ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji(isTaken ? '🔒' : '✅')
                .setDisabled(false); // Never disable buttons - users can always click to sign up or remove themselves
            
            buttons.push(button);
        });
        
        // Group buttons into rows of 4, but limit to maximum 5 rows (Discord limit)
        const buttonRows = [];
        const maxRows = 5; // Discord limit
        const maxButtons = maxRows * 4; // 20 buttons maximum
        
        // If we have more buttons than can fit, truncate and add a note
        const buttonsToShow = buttons.slice(0, maxButtons);
        
        for (let i = 0; i < buttonsToShow.length; i += 4) {
            const row = new ActionRowBuilder().addComponents(buttonsToShow.slice(i, i + 4));
            buttonRows.push(row);
        }
        
        // If we had to truncate, add a note about it
        if (buttons.length > maxButtons) {
            console.warn(`Too many builds (${builds.length}) for signup interface. Showing only first ${maxButtons} builds.`);
        }
        
        return buttonRows;
    },

    // Handle build sign-up button interactions
    async handleBuildSignup(interaction, db) {
        try {
            // Initialize event signups storage if it doesn't exist
            if (!interaction.client.eventSignups) {
                interaction.client.eventSignups = new Map();
            }
            
            // Ensure signupData Map exists
            if (!interaction.client.signupData) {
                interaction.client.signupData = new Map();
            }

            const customId = interaction.customId;
            const parts = customId.split('_');
            const compName = parts[2];
            const sessionId = parts[3];
            const buildIndex = parseInt(parts[4]);
            const userId = interaction.user.id;
            const userName = interaction.user.username;
            
            console.log(`Build signup: User ${userName} (${userId}) signing up for build ${buildIndex} in composition ${compName}, session ${sessionId}`);
            
            // Load existing signups for this composition from database to ensure we have current data
            await this.loadCompositionSignups(interaction, compName, db, sessionId);
            
            // Get the composition details
            let selectedComp = null;
            
            // First try to find in all comps (most efficient)
            const allComps = await db.getComps(interaction.guildId, 'all');
            if (allComps && Array.isArray(allComps)) {
                selectedComp = allComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === compName);
            }
            
            if (!selectedComp) {
                // Fallback: try to find in general comps
                const generalComps = await db.getComps(interaction.guildId, null);
                if (generalComps && Array.isArray(generalComps)) {
                    selectedComp = generalComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === compName);
                }
            }
            
            if (!selectedComp) {
                // Fallback: try to find in content type comps
                const contentTypes = await db.getContentTypes(interaction.guildId);
                for (const contentType of contentTypes) {
                    const contentTypeComps = await db.getComps(interaction.guildId, contentType);
                    if (contentTypeComps && Array.isArray(contentTypeComps)) {
                        selectedComp = contentTypeComps.find(comp => comp && comp.name && typeof comp.name === 'string' && comp.name === compName);
                        if (selectedComp) break;
                    }
                }
            }
            
            if (!selectedComp || !selectedComp.builds || !selectedComp.builds[buildIndex]) {
                await interaction.reply({
                    content: '❌ Build not found.',
                    ephemeral: true
                });
                return;
            }
            
            const buildName = selectedComp.builds[buildIndex].name || selectedComp.builds[buildIndex];
            
            // Check if this build is already taken by someone else
            const signupKey = `comp_${compName}_${sessionId}_build_${buildIndex}`;
            const currentSignups = interaction.client.eventSignups?.get(signupKey) || [];
            
            if (currentSignups.includes(userId)) {
                // User is already signed up for this build, remove them
                const newSignups = currentSignups.filter(id => id !== userId);
                interaction.client.eventSignups.set(signupKey, newSignups);
                
                // Also remove from database
                await db.removeCompositionSignup(interaction.guildId, compName, buildIndex, userId, sessionId);
                
                // Acknowledge the button interaction without showing a message
                await interaction.deferUpdate();
            } else {
                // Check if this build is already taken by someone else
                if (currentSignups.length > 0) {
                    await interaction.reply({
                        content: `❌ **${buildName}** is already taken by <@${currentSignups[0]}>. Please choose a different build.`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Check if user is already signed up for any other build in this composition
                let userAlreadySignedUp = false;
                let userCurrentBuild = '';
                
                for (let i = 0; i < selectedComp.builds.length; i++) {
                    const otherSignupKey = `comp_${compName}_${sessionId}_build_${i}`;
                    const otherSignups = interaction.client.eventSignups?.get(otherSignupKey) || [];
                    
                    if (otherSignups.includes(userId)) {
                        userAlreadySignedUp = true;
                        userCurrentBuild = selectedComp.builds[i].name || selectedComp.builds[i];
                        break;
                    }
                }
                
                if (userAlreadySignedUp) {
                    await interaction.reply({
                        content: `❌ You are already signed up for **${userCurrentBuild}**. Please remove yourself from that build first if you want to change.`,
                        ephemeral: true
                    });
                    return;
                }
                
                // Add user to signups (only one user per build)
                interaction.client.eventSignups.set(signupKey, [userId]);
                
                // Also add to database
                await db.addCompositionSignup(interaction.guildId, compName, buildIndex, userId, sessionId);
                
                // Acknowledge the button interaction without showing a message
                await interaction.deferUpdate();
            }
            
            // Update the signup message with new signup information
            await this.updateSignupMessage(interaction, compName, selectedComp, sessionId);
            
        } catch (error) {
            console.error('Error handling build signup:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your signup. Please try again.',
                ephemeral: true
            });
        }
    },

    // Update the signup message with current signup information
    async updateSignupMessage(interaction, compName, composition, sessionId) {
        try {
            // Get the current user ID for proper button states
            const currentUserId = interaction.user.id;
            
            // Calculate total signups for the count display
            let totalSignups = 0;
            for (let i = 0; i < composition.builds.length; i++) {
                const signupKey = `comp_${compName}_${sessionId}_build_${i}`;
                const signups = interaction.client.eventSignups?.get(signupKey) || [];
                if (signups.length > 0) {
                    totalSignups++;
                }
            }
            const totalBuilds = composition.builds.length;
            
            // Create the updated embed
            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle(`📝 Build Signup - ${totalSignups}/${totalBuilds}`)
                .setDescription(`**${compName}** - Available Builds`)
                .setFooter({ text: `Phoenix Assistance Bot • Click buttons below to sign up • Session: ${sessionId}` })
                .setTimestamp();

            // Add build list with current signups
            const buildList = composition.builds.map((build, index) => {
                const buildName = build.name || build;
                const signupKey = `comp_${compName}_${sessionId}_build_${index}`;
                const signups = interaction.client.eventSignups?.get(signupKey) || [];
                
                if (signups.length === 0) {
                    return `${index + 1}. **${buildName}** - *No signups*`;
                } else {
                    const userMentions = signups.map(id => `<@${id}>`).join(', ');
                    return `${index + 1}. **${buildName}** - ${userMentions}`;
                }
            }).join('\n');

            // Add build list fields, splitting into multiple fields if needed
            this.addBuildListFields(embed, buildList);

            // Create updated build signup buttons
            const buttonRows = this.createBuildSignupButtons(composition.builds, compName, interaction.client.eventSignups, currentUserId, sessionId);
            
            // Find and update the public signup message in the channel
            const channel = interaction.channel;
            const messages = await channel.messages.fetch({ limit: 50 });
            const signupMessage = messages.find(msg => 
                msg.embeds && 
                msg.embeds.length > 0 && 
                msg.embeds[0] && 
                msg.embeds[0].title && 
                msg.embeds[0].title.startsWith('📝 Build Signup') &&
                msg.embeds[0].description && 
                msg.embeds[0].description.includes(compName) &&
                msg.embeds[0].footer && 
                msg.embeds[0].footer.text && 
                msg.embeds[0].footer.text.includes(`Session: ${sessionId}`) &&
                msg.author && 
                msg.author.id === interaction.client.user.id
            );
            
            if (signupMessage) {
                try {
                    await signupMessage.edit({
                        embeds: [embed],
                        components: buttonRows
                    });
                    console.log('Public signup message updated with new signup information');
                } catch (editError) {
                    console.error('Error editing signup message:', editError);
                }
            } else {
                console.log('Could not find public signup message to update');
                console.log('Searched through', messages.size, 'messages');
                console.log('Looking for message with compName:', compName, 'and sessionId:', sessionId);
            }
            
        } catch (error) {
            console.error('Error updating signup message:', error);
        }
    },

    // Generate a unique session ID for each signup session
    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Helper function to add build list fields to an embed, splitting into multiple fields if needed
    addBuildListFields(embed, buildList, fieldName = '🎭 **Available Builds**') {
        const maxFieldLength = 1024;
        if (buildList.length <= maxFieldLength) {
            // Single field if under limit
            embed.addFields({
                name: fieldName,
                value: buildList,
                inline: false
            });
        } else {
            // Split into multiple fields
            const buildLines = buildList.split('\n');
            let currentField = '';
            let fieldIndex = 1;
            
            for (const line of buildLines) {
                // Check if adding this line would exceed the limit
                if (currentField.length + line.length + 1 > maxFieldLength) {
                    // Add current field and start a new one
                    embed.addFields({
                        name: fieldIndex === 1 ? fieldName : `${fieldName} (cont.)`,
                        value: currentField.trim(),
                        inline: false
                    });
                    currentField = line;
                    fieldIndex++;
                } else {
                    // Add line to current field
                    currentField += (currentField ? '\n' : '') + line;
                }
            }
            
            // Add the last field if it has content
            if (currentField.trim()) {
                embed.addFields({
                    name: fieldIndex === 1 ? fieldName : `${fieldName} (cont.)`,
                    value: currentField.trim(),
                    inline: false
                });
            }
        }
    }
};
