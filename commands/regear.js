const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    
    // Check if we're on page 2 (gear selection) by checking title
    if (embed && embed.title && embed.title.includes('Step 2')) {
        selections.tierConfirmed = true;
        
        // Parse tier from description (format: "**Tier: T7**")
        if (embed.description) {
            const tierMatch = embed.description.match(/\*\*Tier:\s*(.+?)\*\*/);
            if (tierMatch) {
                selections.selectedTier = tierMatch[1].trim();
            }
        }
    } else {
        // On page 1 (tier selection)
        selections.tierConfirmed = false;
        
        // Parse selected tier from description
        if (embed && embed.description) {
            const tierMatch = embed.description.match(/\*\*Selected Tier:\s*(.+?)\*\*/);
            if (tierMatch) {
                selections.selectedTier = tierMatch[1].trim();
            }
        }
    }
    
    // Parse slot selections from fields
    if (embed && embed.fields && embed.fields.length > 0) {
        // Look for "Selected Items" field
        const selectedField = embed.fields.find(field => field.name === 'Selected Items');
        if (selectedField && selectedField.value) {
            // Parse format: "• **Head:** ItemName (Tier)"
            const lines = selectedField.value.split('\n');
            lines.forEach(line => {
                const match = line.match(/^•\s*\*\*(.+?):\*\*\s*(.+?)\s*\((.+?)\)$/);
                if (match) {
                    const [, slot, name, tier] = match;
                    selections[slot.toLowerCase()] = { name: name.trim(), tierEquivalent: tier.trim(), slot: slot.toLowerCase() };
                }
            });
        }
    }
    return selections;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('regear')
        .setDescription('Request a regear using items from inventory'),

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

            await this.showRegearMenu(interaction, db, {});
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

        // Check if tier is confirmed (tierConfirmed indicates we're on page 2)
        const selectedTier = currentSelections.selectedTier;
        const tierConfirmed = currentSelections.tierConfirmed || false;

        // PAGE 1: Tier Selection
        if (!tierConfirmed) {
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

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎒 Regear Request - Step 1: Select Tier')
                .setDescription(selectedTier 
                    ? `**Selected Tier: ${selectedTier}**\n\nClick **Confirm Tier** to proceed to gear selection.`
                    : '**Step 1:** Select a tier from the dropdown below.\n**Step 2:** Click **Confirm Tier** to proceed.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            const rows = [
                new ActionRowBuilder().addComponents(tierSelectMenu)
            ];

            // Add confirm/cancel buttons only if tier is selected
            if (selectedTier) {
                rows.push(
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('regear_confirm_tier')
                                .setLabel('✅ Confirm Tier')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('regear_cancel')
                                .setLabel('❌ Cancel')
                                .setStyle(ButtonStyle.Danger)
                        )
                );
            }

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: rows });
            } else {
                await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
            }
            return;
        }

        // PAGE 2: Gear Selection (tier is confirmed)
        // Filter inventory by confirmed tier
        const filteredInventory = inventory.filter(item => item.tierEquivalent === selectedTier);

        // Group inventory by slot (filtered by tier)
        const inventoryBySlot = {};
        VALID_SLOTS.forEach(slot => {
            inventoryBySlot[slot] = filteredInventory.filter(item => item.slot === slot);
        });

        // Helper function to create a dropdown for a slot
        const createSlotDropdown = (slot) => {
            // Sort items by tier (lower first), then by name
            let slotItems = inventoryBySlot[slot];
            slotItems = sortItemsByTierAndName([...slotItems]);
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`regear_${slot}`);
            
            if (slotItems.length === 0) {
                // Disabled if no items available
                selectMenu
                    .setPlaceholder(`${formatSlotName(slot)} - No items available`)
                    .setDisabled(true)
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel('No items available')
                            .setValue('none')
                            .setDescription('No items in this slot')
                    ]);
            } else {
                // Enabled dropdown with items
                selectMenu
                    .setPlaceholder(`Select ${formatSlotName(slot)} gear`)
                    .setMinValues(0)
                    .setMaxValues(1);
                
                // Track seen values to prevent duplicates
                const seenValues = new Set();
                const options = [];
                
                // Check if this slot already has a selection
                const currentSelection = currentSelections[slot];
                
                // Add options for each item
                slotItems.forEach(item => {
                    const value = `${item.name}|${item.tierEquivalent}|${item.slot}`;
                    
                    // Skip if we've already seen this exact value
                    if (seenValues.has(value)) {
                        return;
                    }
                    
                    seenValues.add(value);
                    
                    const label = `${item.name} (${item.tierEquivalent})`;
                    const description = `Qty: ${item.quantity}${item.notes ? ` | ${item.notes}` : ''}`;
                    
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
                        .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description)
                        .setValue(value);
                    
                    // Mark as default if this is the current selection
                    if (currentSelection && currentSelection.name === item.name && currentSelection.tierEquivalent === item.tierEquivalent) {
                        option.setDefault(true);
                    }
                    
                    options.push(option);
                });
                
                // Add all options at once
                if (options.length > 0) {
                    selectMenu.addOptions(options);
                }
            }
            
            return selectMenu;
        };

        // Group slot dropdowns (5 slots = 5 dropdowns, need to fit in remaining rows)
        // Row 1: Head, Chest (2 dropdowns)
        // Row 2: Shoes, Main-Hand, Off-Hand (3 dropdowns)
        const rows = [];
        
        const headChestRow = new ActionRowBuilder()
            .addComponents(createSlotDropdown('head'), createSlotDropdown('chest'));
        rows.push(headChestRow);
        
        const shoesMainhandOffhandRow = new ActionRowBuilder()
            .addComponents(createSlotDropdown('shoes'), createSlotDropdown('main-hand'), createSlotDropdown('off-hand'));
        rows.push(shoesMainhandOffhandRow);

        // Build selected items display
        let selectedItemsText = '';
        let hasSelections = false;
        for (const slot of VALID_SLOTS) {
            if (currentSelections[slot]) {
                const sel = currentSelections[slot];
                selectedItemsText += `• **${formatSlotName(slot)}:** ${sel.name} (${sel.tierEquivalent})\n`;
                hasSelections = true;
            }
        }

        if (!hasSelections) {
            selectedItemsText = 'No items selected yet.';
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎒 Regear Request - Step 2: Select Gear')
            .setDescription(`**Tier: ${selectedTier}**\n\nSelect the gear items you need from the dropdowns below.\nSelect one item per slot, then click **Confirm Regear** to complete your request.`)
            .addFields(
                { name: 'Selected Items', value: selectedItemsText, inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        // Add confirm/cancel buttons
        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('regear_confirm')
                    .setLabel('✅ Confirm Regear')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('regear_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
        rows.push(confirmRow);

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components: rows });
        } else {
            await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
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
        
        if (customId === 'regear_confirm_tier') {
            // Get current selections from the embed
            const currentEmbed = interaction.message.embeds[0];
            const selections = parseSelectionsFromEmbed(currentEmbed);

            if (!selections.selectedTier) {
                await interaction.reply({ content: 'Please select a tier first.', ephemeral: true });
                return true;
            }

            await interaction.deferUpdate();

            // Mark tier as confirmed and proceed to page 2
            selections.tierConfirmed = true;
            
            // Show gear selection page
            await this.showRegearMenu(interaction, db, selections);
            return true;
        } else if (customId === 'regear_confirm') {
            // Get current selections from the embed
            const currentEmbed = interaction.message.embeds[0];
            const selections = parseSelectionsFromEmbed(currentEmbed);

            if (Object.keys(selections).length === 0) {
                await interaction.reply({ content: 'No items selected to confirm.', ephemeral: true });
                return true;
            }

            await interaction.deferUpdate();

            // Process each selection (skip selectedTier, only process slot selections)
            const results = [];
            const errors = [];

            for (const [slot, selection] of Object.entries(selections)) {
                // Skip selectedTier, only process actual slot selections
                if (slot === 'selectedTier') {
                    continue;
                }
                
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
                    resultText += `• **${r.slot.charAt(0).toUpperCase() + r.slot.slice(1)}:** ${r.name} (${r.tierEquivalent}) - Remaining: ${r.remainingQuantity}\n`;
                });
            }

            if (errors.length > 0) {
                resultText += '\n**❌ Errors:**\n';
                errors.forEach(e => {
                    resultText += `• **${e.slot.charAt(0).toUpperCase() + e.slot.slice(1)}:** ${e.name} - ${e.error}\n`;
                });
            }

            const embed = new EmbedBuilder()
                .setColor(errors.length > 0 ? '#FFAA00' : '#00FF00')
                .setTitle(errors.length > 0 ? '⚠️ Regear Partially Completed' : '✅ Regear Completed')
                .setDescription(resultText || 'No items were processed.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

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
    }
};
