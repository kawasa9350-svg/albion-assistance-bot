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

// Helper function to parse selections from embed fields
function parseSelectionsFromEmbed(embed) {
    const selections = {};
    
    // Parse selected tier from description
    if (embed && embed.description) {
        const tierMatch = embed.description.match(/\*\*Selected Tier:\s*(.+?)\*\*/);
        if (tierMatch) {
            selections.selectedTier = tierMatch[1].trim();
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

        // Get selected tier (from currentSelections or need to select)
        const selectedTier = currentSelections.selectedTier;

        // Filter inventory by selected tier if tier is selected
        let filteredInventory = inventory;
        if (selectedTier) {
            filteredInventory = inventory.filter(item => item.tierEquivalent === selectedTier);
        }

        // Group inventory by slot (filtered by tier)
        const inventoryBySlot = {};
        VALID_SLOTS.forEach(slot => {
            inventoryBySlot[slot] = filteredInventory.filter(item => item.slot === slot);
        });

        // Create rows
        const rows = [];

        // Add tier selection dropdown first
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

        rows.push(new ActionRowBuilder().addComponents(tierSelectMenu));

        // Create dropdowns for each slot (only if tier is selected)
        if (!selectedTier) {
            // Disable all slot dropdowns if no tier selected
            for (const slot of VALID_SLOTS) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${slot}`)
                    .setPlaceholder(`${slot.charAt(0).toUpperCase() + slot.slice(1)} - Select tier first`)
                    .setDisabled(true)
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Select tier first')
                            .setValue('none')
                            .setDescription('Please select a tier above')
                    ]);
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            }
        } else {
            // Create enabled dropdowns with filtered items
            for (const slot of VALID_SLOTS) {
            // Sort items by tier (lower first), then by name
            let slotItems = inventoryBySlot[slot];
            slotItems = sortItemsByTierAndName([...slotItems]);
            
            if (slotItems.length === 0) {
                // Create disabled dropdown if no items
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${slot}`)
                    .setPlaceholder(`${slot.charAt(0).toUpperCase() + slot.slice(1)} - No items available`)
                    .setDisabled(true)
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel('No items available')
                            .setValue('none')
                            .setDescription('No items in this slot')
                    ]);
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            } else {
                // Create enabled dropdown with items
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${slot}`)
                    .setPlaceholder(`Select ${slot.charAt(0).toUpperCase() + slot.slice(1)} gear`)
                    .setMinValues(0)
                    .setMaxValues(1);
                
                // Track seen values to prevent duplicates
                const seenValues = new Set();
                const options = [];
                
                // Check if this slot already has a selection
                const currentSelection = currentSelections[slot];
                
                // Add options for each item (format: name|tierEquivalent|slot for value)
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
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            }
            }
        }

        // Build selected items display
        let selectedItemsText = '';
        let hasSelections = false;
        for (const slot of VALID_SLOTS) {
            if (currentSelections[slot]) {
                const sel = currentSelections[slot];
                selectedItemsText += `• **${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${sel.name} (${sel.tierEquivalent})\n`;
                hasSelections = true;
            }
        }

        if (!hasSelections) {
            selectedItemsText = 'No items selected yet.';
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎒 Regear Request')
            .setDescription(selectedTier 
                ? `**Selected Tier: ${selectedTier}**\n\nSelect the gear items you need from the dropdowns below.\nSelect one item per slot, then click **Confirm** to complete your request.`
                : '**Step 1:** Select a tier from the dropdown above.\n**Step 2:** Then select gear items for each slot.\n**Step 3:** Click **Confirm** to complete your request.')
            .addFields(
                { name: 'Selected Items', value: selectedItemsText, inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        // Add confirm/cancel buttons only if there are selections
        if (hasSelections) {
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
        }

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

        // Handle tier selection
        if (customId === 'regear_tier') {
            if (interaction.values.length === 0 || interaction.values[0] === 'none') {
                // Clear tier selection and all slot selections
                delete currentSelections.selectedTier;
                // Clear all slot selections when tier changes
                VALID_SLOTS.forEach(slot => delete currentSelections[slot]);
            } else {
                const selectedTier = interaction.values[0];
                const oldTier = currentSelections.selectedTier;
                
                // If tier changed, clear all slot selections
                if (oldTier && oldTier !== selectedTier) {
                    VALID_SLOTS.forEach(slot => delete currentSelections[slot]);
                }
                
                currentSelections.selectedTier = selectedTier;
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
        
        if (customId === 'regear_confirm') {
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
            
            // Reset to initial state
            await this.showRegearMenu(interaction, db, {});
            return true;
        }

        return false;
    }
};
