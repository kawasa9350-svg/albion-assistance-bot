const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { parseTierEquivalent } = require('./inventory.js');

const VALID_SLOTS = ['head', 'chest', 'shoes', 'main-hand', 'off-hand'];

// Helper function to extract tier number for sorting (e.g., "T7" -> 7, "T8" -> 8)
function getTierNumber(tierEquivalent) {
    const match = tierEquivalent.match(/^T?(\d+)$/i);
    return match ? parseInt(match[1], 10) : 999; // Return 999 for invalid tiers so they sort last
}

// Helper function to sort items by tier (lower first), then by name
function sortItemsByTierAndName(items) {
    return items.sort((a, b) => {
        const tierA = getTierNumber(a.tierEquivalent);
        const tierB = getTierNumber(b.tierEquivalent);
        
        // First sort by tier (lower tiers first)
        if (tierA !== tierB) {
            return tierA - tierB;
        }
        
        // If same tier, sort by name alphabetically
        return a.name.localeCompare(b.name);
    });
}

// Helper function to format slot name for display (handles hyphens)
function formatSlotName(slot) {
    // Handle hyphenated slots like "main-hand" and "off-hand"
    return slot.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
}

// Helper function to parse selections from embed fields
function parseSelectionsFromEmbed(embed) {
    const selections = {};
    
    // Determine current page from title
    if (embed && embed.title) {
        if (embed.title.includes('Step 1')) {
            selections.currentPage = 1;
        } else if (embed.title.includes('Step 2')) {
            selections.currentPage = 2;
            selections.tierConfirmed = true;
        } else if (embed.title.includes('Step 3')) {
            selections.currentPage = 3;
            selections.tierConfirmed = true;
        }
    }
    
    // Parse tier from description
    if (embed && embed.description) {
        const tierMatch = embed.description.match(/\*\*Tier:\s*(.+?)\*\*/) || 
                         embed.description.match(/\*\*Selected Tier:\s*(.+?)\*\*/);
        if (tierMatch) {
            selections.selectedTier = tierMatch[1].trim();
        }
        
        // Parse recipient user tag and ID
        const recipientMatch = embed.description.match(/\*\*Recipient:\*\*\s*(.+?)(?:\n|$)/);
        if (recipientMatch) {
            selections.targetUserTag = recipientMatch[1].trim();
        }
        const recipientIdMatch = embed.description.match(/\*\*Recipient ID:\*\*\s*(.+?)(?:\n|$)/);
        if (recipientIdMatch) {
            selections.targetUserId = recipientIdMatch[1].trim();
        }
    }
    
    // Parse slot selections from fields (for summary on page 3 or selections on page 2)
    if (embed && embed.fields && embed.fields.length > 0) {
        // Look for "Selected Items" field
        const selectedField = embed.fields.find(field => field.name === 'Selected Items' || field.name === 'Summary');
        if (selectedField && selectedField.value) {
            // Parse format: "• **Head:** ItemName (Tier)"
            const lines = selectedField.value.split('\n');
            lines.forEach(line => {
                const match = line.match(/^•\s*\*\*(.+?):\*\*\s*(.+?)\s*\((.+?)\)$/);
                if (match) {
                    const [, slot, name, tier] = match;
                    const slotLower = slot.toLowerCase();
                    selections[slotLower] = { 
                        name: name.trim(), 
                        tierEquivalent: tier.trim(), 
                        slot: slotLower 
                    };
                }
            });
        }
    }
    return selections;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('regear')
        .setDescription('Issue a regear to a user using items from inventory')
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Issue a regear to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give the regear to')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up regear logging channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send regear logs to')
                        .setRequired(true))),

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

            if (subcommand === 'setup') {
                return await this.handleSetup(interaction, db);
            } else if (subcommand === 'give') {
                const targetUser = interaction.options.getUser('user');
                await this.showRegearMenu(interaction, db, { targetUserId: targetUser.id, targetUserTag: targetUser.tag });
            }
        } catch (error) {
            console.error('Error in regear command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the regear command.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },

    async handleSetup(interaction, db) {
        try {
            const channel = interaction.options.getChannel('channel');
            
            // Verify it's a text channel
            if (channel.type !== ChannelType.GuildText) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Invalid Channel')
                    .setDescription('Please select a text channel.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const success = await db.setRegearLogChannel(interaction.guildId, channel.id);

            if (success) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Regear Log Channel Set')
                    .setDescription(`Regear logs will now be sent to ${channel}.`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('Failed to set regear log channel. Please try again.')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error('Error in regear setup:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while setting up the regear log channel.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async showRegearMenu(interaction, db, currentSelections = {}) {
        // Get inventory for all slots
        const inventory = await db.getInventory(interaction.guildId);

        if (inventory.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('📦 Inventory Empty')
                .setDescription('No items available in inventory. Add items using `/inventory add` first.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Determine current page (default to 1 if not set)
        const currentPage = currentSelections.currentPage || 1;
        const selectedTier = currentSelections.selectedTier;

        // PAGE 1: Tier Selection
        if (currentPage === 1) {
            // Get all unique tiers from inventory
            const uniqueTiers = new Set();
            inventory.forEach(item => {
                uniqueTiers.add(item.tierEquivalent);
            });
            const sortedTiers = Array.from(uniqueTiers).sort((a, b) => {
                const tierA = getTierNumber(a);
                const tierB = getTierNumber(b);
                return tierA - tierB;
            });

            const tierSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('regear_tier')
                .setPlaceholder(selectedTier ? `Selected: ${selectedTier}` : 'Select Tier First')
                .setMinValues(0)
                .setMaxValues(1);

            sortedTiers.forEach(tier => {
                tierSelectMenu.addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel(tier)
                        .setValue(tier)
                        .setDefault(selectedTier === tier)
                ]);
            });

            const targetUserInfo = currentSelections.targetUserTag 
                ? `\n**Recipient:** ${currentSelections.targetUserTag}${currentSelections.targetUserId ? `\n**Recipient ID:** ${currentSelections.targetUserId}` : ''}` 
                : '';
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎒 Regear Request - Step 1: Select Tier')
                .setDescription((selectedTier 
                    ? `**Selected Tier: ${selectedTier}**${targetUserInfo}\n\nClick **Next** to proceed to gear selection.`
                    : `Select a tier from the dropdown below, then click **Next** to continue.${targetUserInfo}`))
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            const rows = [
                new ActionRowBuilder().addComponents(tierSelectMenu)
            ];

            // Add navigation buttons
            const navButtons = new ActionRowBuilder();
            if (selectedTier) {
                navButtons.addComponents(
                    new ButtonBuilder()
                        .setCustomId('regear_next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                );
            }
            navButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId('regear_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
            rows.push(navButtons);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: rows });
            } else {
                await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
            }
            return;
        }

        // PAGE 2: Head, Chest, Shoes Selection
        if (currentPage === 2) {
            // Filter inventory by selected tier
            const filteredInventory = inventory.filter(item => item.tierEquivalent === selectedTier);

            // Helper function to create a dropdown for a slot
            const createSlotDropdown = (slot) => {
                const slotItems = filteredInventory.filter(item => item.slot === slot);
                const sortedItems = sortItemsByTierAndName([...slotItems]);
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${slot}`);
                
                if (sortedItems.length === 0) {
                    selectMenu
                        .setPlaceholder(`${formatSlotName(slot)} - No items available`)
                        .setDisabled(true)
                        .addOptions([
                            new StringSelectMenuOptionBuilder()
                                .setLabel('No items available')
                                .setValue('none')
                        ]);
                } else {
                    selectMenu
                        .setPlaceholder(`Select ${formatSlotName(slot)}`)
                        .setMinValues(0)
                        .setMaxValues(1);
                    
                    const seenValues = new Set();
                    const currentSelection = currentSelections[slot];
                    
                    sortedItems.forEach(item => {
                        const value = `${item.name}|${item.tierEquivalent}|${item.slot}`;
                        if (seenValues.has(value)) return;
                        seenValues.add(value);
                        
                        const label = `${item.name} (${item.tierEquivalent})`;
                        const description = `Qty: ${item.quantity}${item.notes ? ` | ${item.notes}` : ''}`;
                        
                        const option = new StringSelectMenuOptionBuilder()
                            .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
                            .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description)
                            .setValue(value);
                        
                        if (currentSelection && currentSelection.name === item.name && currentSelection.tierEquivalent === item.tierEquivalent) {
                            option.setDefault(true);
                        }
                        
                        selectMenu.addOptions([option]);
                    });
                }
                
                return selectMenu;
            };

            // Build page 2 rows: Head, Chest, Shoes in separate rows
            const rows = [
                new ActionRowBuilder().addComponents(createSlotDropdown('head')),
                new ActionRowBuilder().addComponents(createSlotDropdown('chest')),
                new ActionRowBuilder().addComponents(createSlotDropdown('shoes'))
            ];

            // Build selected items display for page 2 slots
            const page2Slots = ['head', 'chest', 'shoes'];
            let selectedItemsText = '';
            for (const slot of page2Slots) {
                if (currentSelections[slot]) {
                    const sel = currentSelections[slot];
                    selectedItemsText += `• **${formatSlotName(slot)}:** ${sel.name} (${sel.tierEquivalent})\n`;
                }
            }
            if (!selectedItemsText) {
                selectedItemsText = 'No items selected yet.';
            }

            const targetUserInfo = currentSelections.targetUserTag 
                ? `\n**Recipient:** ${currentSelections.targetUserTag}${currentSelections.targetUserId ? `\n**Recipient ID:** ${currentSelections.targetUserId}` : ''}` 
                : '';
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎒 Regear Request - Step 2: Select Head, Chest, Shoes')
                .setDescription(`**Tier: ${selectedTier}**${targetUserInfo}\n\nSelect gear for Head, Chest, and Shoes.`)
                .addFields({ name: 'Selected Items', value: selectedItemsText, inline: false })
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Navigation buttons
            const navButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('regear_back')
                        .setLabel('◀️ Back')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('regear_next')
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('regear_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                );
            rows.push(navButtons);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: rows });
            } else {
                await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
            }
            return;
        }

        // PAGE 3: Main-Hand, Off-Hand Selection + Summary
        if (currentPage === 3) {
            // Filter inventory by selected tier
            const filteredInventory = inventory.filter(item => item.tierEquivalent === selectedTier);

            // Helper function to create a dropdown for a slot
            const createSlotDropdown = (slot) => {
                const slotItems = filteredInventory.filter(item => item.slot === slot);
                const sortedItems = sortItemsByTierAndName([...slotItems]);
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${slot}`);
                
                if (sortedItems.length === 0) {
                    selectMenu
                        .setPlaceholder(`${formatSlotName(slot)} - No items available`)
                        .setDisabled(true)
                        .addOptions([
                            new StringSelectMenuOptionBuilder()
                                .setLabel('No items available')
                                .setValue('none')
                        ]);
                } else {
                    selectMenu
                        .setPlaceholder(`Select ${formatSlotName(slot)}`)
                        .setMinValues(0)
                        .setMaxValues(1);
                    
                    const seenValues = new Set();
                    const currentSelection = currentSelections[slot];
                    
                    sortedItems.forEach(item => {
                        const value = `${item.name}|${item.tierEquivalent}|${item.slot}`;
                        if (seenValues.has(value)) return;
                        seenValues.add(value);
                        
                        const label = `${item.name} (${item.tierEquivalent})`;
                        const description = `Qty: ${item.quantity}${item.notes ? ` | ${item.notes}` : ''}`;
                        
                        const option = new StringSelectMenuOptionBuilder()
                            .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
                            .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description)
                            .setValue(value);
                        
                        if (currentSelection && currentSelection.name === item.name && currentSelection.tierEquivalent === item.tierEquivalent) {
                            option.setDefault(true);
                        }
                        
                        selectMenu.addOptions([option]);
                    });
                }
                
                return selectMenu;
            };

            // Build page 3 rows: Main-Hand, Off-Hand
            const rows = [
                new ActionRowBuilder().addComponents(createSlotDropdown('main-hand')),
                new ActionRowBuilder().addComponents(createSlotDropdown('off-hand'))
            ];

            // Build summary of ALL selected items
            let summaryText = '';
            let hasAnySelection = false;
            for (const slot of VALID_SLOTS) {
                if (currentSelections[slot]) {
                    const sel = currentSelections[slot];
                    summaryText += `• **${formatSlotName(slot)}:** ${sel.name} (${sel.tierEquivalent})\n`;
                    hasAnySelection = true;
                }
            }
            if (!hasAnySelection) {
                summaryText = 'No items selected yet.';
            }

            const targetUserInfo = currentSelections.targetUserTag 
                ? `\n**Recipient:** ${currentSelections.targetUserTag}${currentSelections.targetUserId ? `\n**Recipient ID:** ${currentSelections.targetUserId}` : ''}` 
                : '';
            
            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎒 Regear Request - Step 3: Select Main-Hand, Off-Hand & Confirm')
                .setDescription(`**Tier: ${selectedTier}**${targetUserInfo}\n\nSelect Main-Hand and Off-Hand gear, then review your selections below and click **Confirm** to finalize.`)
                .addFields({ name: 'Summary', value: summaryText, inline: false })
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Navigation buttons
            const navButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('regear_back')
                        .setLabel('◀️ Back')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('regear_confirm')
                        .setLabel('✅ Confirm Regear')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('regear_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                );
            rows.push(navButtons);

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: rows });
            } else {
                await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
            }
            return;
        }
    },

    async handleSelectMenuInteraction(interaction, db) {
        const customId = interaction.customId;
        
        if (!customId.startsWith('regear_')) {
            return false;
        }

        // Defer the update
        await interaction.deferUpdate();

        // Get current selections from the embed
        const currentEmbed = interaction.message.embeds[0];
        let currentSelections = parseSelectionsFromEmbed(currentEmbed);

        // Handle tier selection (only on page 1)
        if (customId === 'regear_tier') {
            if (interaction.values.length === 0 || interaction.values[0] === 'none') {
                // Clear tier selection
                delete currentSelections.selectedTier;
                delete currentSelections.tierConfirmed;
            } else {
                const selectedTier = interaction.values[0];
                currentSelections.selectedTier = selectedTier;
                // Don't set tierConfirmed here - wait for confirm button
            }
        } else {
            // Handle slot selection
            const slot = customId.replace('regear_', '');
            
            if (!VALID_SLOTS.includes(slot)) {
                await interaction.followUp({ content: 'Invalid slot selected.', ephemeral: true });
                return true;
            }

            // Handle deselection
            if (interaction.values.length === 0 || interaction.values[0] === 'none') {
                // Remove selection for this slot
                delete currentSelections[slot];
            } else {
                // Parse the selected value: name|tierEquivalent|slot
                const selectedValue = interaction.values[0];
                const [gearName, tierEquivalent, gearSlot] = selectedValue.split('|');
                
                // Store the selection
                currentSelections[slot] = {
                    name: gearName,
                    tierEquivalent: tierEquivalent,
                    slot: gearSlot
                };
            }
        }

        // Refresh the menu with updated selections
        await this.showRegearMenu(interaction, db, currentSelections);
        return true;
    },

    async handleButtonInteraction(interaction, db) {
        const customId = interaction.customId;
        
        // Get current selections from the embed
        const currentEmbed = interaction.message.embeds[0];
        const selections = parseSelectionsFromEmbed(currentEmbed);

        if (customId === 'regear_next') {
            await interaction.deferUpdate();

            // Navigate to next page
            if (selections.currentPage === 1) {
                // Page 1 -> Page 2: Need tier selected
                if (!selections.selectedTier) {
                    await interaction.followUp({ content: 'Please select a tier first.', ephemeral: true });
                    return true;
                }
                selections.currentPage = 2;
                selections.tierConfirmed = true;
            } else if (selections.currentPage === 2) {
                // Page 2 -> Page 3
                selections.currentPage = 3;
            }

            await this.showRegearMenu(interaction, db, selections);
            return true;
        } else if (customId === 'regear_back') {
            await interaction.deferUpdate();

            // Navigate to previous page
            if (selections.currentPage === 3) {
                selections.currentPage = 2;
            } else if (selections.currentPage === 2) {
                selections.currentPage = 1;
                // Keep tier selected but go back
            }

            await this.showRegearMenu(interaction, db, selections);
            return true;
        } else if (customId === 'regear_confirm') {
            // Only allow confirm on page 3
            if (selections.currentPage !== 3) {
                await interaction.reply({ content: 'Please complete all steps before confirming.', ephemeral: true });
                return true;
            }

            // Check if any items are selected
            let hasSelections = false;
            for (const slot of VALID_SLOTS) {
                if (selections[slot]) {
                    hasSelections = true;
                    break;
                }
            }

            if (!hasSelections) {
                await interaction.reply({ content: 'No items selected to confirm.', ephemeral: true });
                return true;
            }

            await interaction.deferUpdate();

            // Process each selection (skip non-slot properties)
            const results = [];
            const errors = [];

            for (const slot of VALID_SLOTS) {
                const selection = selections[slot];
                if (!selection) continue;
                
                const result = await db.removeGearFromInventory(
                    interaction.guildId,
                    selection.name,
                    selection.slot,
                    selection.tierEquivalent,
                    1
                );

                if (result.success) {
                    results.push({
                        slot: slot,
                        name: selection.name,
                        tierEquivalent: selection.tierEquivalent,
                        remainingQuantity: result.remainingQuantity
                    });
                } else {
                    errors.push({
                        slot: slot,
                        name: selection.name,
                        error: result.error
                    });
                }
            }

            // Build confirmation embed
            let resultText = '';
            if (results.length > 0) {
                resultText += '**✅ Successfully Issued:**\n';
                results.forEach(r => {
                    resultText += `• **${formatSlotName(r.slot)}:** ${r.name} (${r.tierEquivalent}) - Remaining: ${r.remainingQuantity}\n`;
                });
            }

            if (errors.length > 0) {
                resultText += '\n**❌ Errors:**\n';
                errors.forEach(e => {
                    resultText += `• **${formatSlotName(e.slot)}:** ${e.name} - ${e.error}\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setColor(errors.length > 0 ? '#FFAA00' : '#00FF00')
                .setTitle(errors.length > 0 ? '⚠️ Regear Partially Completed' : '✅ Regear Completed')
                .setDescription(resultText || 'No items were processed.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Log to regear log channel if configured
            if (results.length > 0) {
                await this.logRegearToChannel(interaction, db, selections, results);
            }

            // Clear all components
            await interaction.editReply({ embeds: [embed], components: [] });
            return true;
        } else if (customId === 'regear_cancel') {
            await interaction.deferUpdate();
            
            // Reset to initial state (page 1)
            await this.showRegearMenu(interaction, db, {});
            return true;
        }

        return false;
    },

    async logRegearToChannel(interaction, db, selections, results) {
        try {
            const logChannelId = await db.getRegearLogChannel(interaction.guildId);
            if (!logChannelId) {
                return; // No log channel configured
            }

            const logChannel = await interaction.guild.channels.fetch(logChannelId);
            if (!logChannel) {
                console.error(`Regear log channel ${logChannelId} not found in guild ${interaction.guildId}`);
                return;
            }

            // Get issuer info
            const issuer = interaction.user;
            const issuerInfo = `${issuer.tag} (${issuer.id})`;

            // Get recipient info (only show mention, no username/tag)
            const recipientId = selections.targetUserId || 'Unknown';
            const recipientInfo = recipientId !== 'Unknown' ? `<@${recipientId}>` : 'Unknown';

            // Build regear details for embed
            let regearDetails = '';
            const selectedTier = selections.selectedTier || 'Unknown';
            
            for (const result of results) {
                regearDetails += `• **${formatSlotName(result.slot)}:** ${result.name} (${result.tierEquivalent})\n`;
            }

            // Build formatted table row for Google Sheets/Docs
            const date = new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Organize gear by slot
            const gearBySlot = {
                'main-hand': '',
                'off-hand': '',
                'head': '',
                'chest': '',
                'shoes': ''
            };
            
            for (const result of results) {
                const gearName = `${result.name} (${result.tierEquivalent})`;
                gearBySlot[result.slot] = gearName;
            }

            // For table, use just the tag (no mention, no ID)
            const recipientTag = selections.targetUserTag || 'Unknown';
            
            // Escape commas in values for CSV format
            const escapeCSV = (value) => {
                if (!value) return '';
                // If value contains comma, quote, or newline, wrap in quotes and escape quotes
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            };
            
            // Format as CSV (comma-separated values) for easy copy-paste to Google Sheets
            const csvHeader = 'Date,Player,Main-hand,Off-hand,Head,Chest,Shoes,Tier,Given By';
            const csvRow = [
                date,
                escapeCSV(recipientTag),
                escapeCSV(gearBySlot['main-hand'] || ''),
                escapeCSV(gearBySlot['off-hand'] || ''),
                escapeCSV(gearBySlot['head'] || ''),
                escapeCSV(gearBySlot['chest'] || ''),
                escapeCSV(gearBySlot['shoes'] || ''),
                escapeCSV(selectedTier),
                escapeCSV(issuer.tag)
            ].join(',');

            // Format as CSV for Discord (easier to copy and paste into Google Sheets)
            const csvTable = `\`\`\`
${csvHeader}
${csvRow}
\`\`\`

**📋 Copy the CSV above and paste into Google Sheets - it will automatically separate into columns**`;

            const logEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎒 Regear Issued')
                .addFields(
                    { name: 'Issued By', value: issuerInfo, inline: true },
                    { name: 'Recipient', value: recipientInfo, inline: true },
                    { name: 'Tier', value: selectedTier, inline: true },
                    { name: 'Regear Details', value: regearDetails || 'No items', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            // Send embed and CSV format
            await logChannel.send({ embeds: [logEmbed] });
            await logChannel.send(csvTable);
        } catch (error) {
            console.error('Error logging regear to channel:', error);
            // Don't throw - logging failure shouldn't break the regear process
        }
    }
};
