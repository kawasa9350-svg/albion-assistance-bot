const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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

            await this.showRegearMenu(interaction, db);
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

    async showRegearMenu(interaction, db) {
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

        // Group inventory by slot
        const inventoryBySlot = {};
        VALID_SLOTS.forEach(slot => {
            inventoryBySlot[slot] = inventory.filter(item => item.slot === slot);
        });

        // Create dropdowns for each slot
        const rows = [];
        
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
                    
                    options.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
                            .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description)
                            .setValue(value)
                    );
                });
                
                // Add all options at once
                if (options.length > 0) {
                    selectMenu.addOptions(options);
                }
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎒 Regear Request')
            .setDescription('Select the gear items you need from the dropdowns below.\nSelect one item per slot.')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    },

    async handleSelectMenuInteraction(interaction, db) {
        const customId = interaction.customId;
        
        if (!customId.startsWith('regear_')) {
            return false;
        }

        const slot = customId.replace('regear_', '');
        
        if (!VALID_SLOTS.includes(slot)) {
            await interaction.reply({ content: 'Invalid slot selected.', ephemeral: true });
            return true;
        }

        if (interaction.values.length === 0) {
            // User deselected, nothing to do
            await interaction.deferUpdate();
            return true;
        }

        const selectedValue = interaction.values[0];
        
        if (selectedValue === 'none') {
            await interaction.deferUpdate();
            return true;
        }

        // Defer the update first to prevent timeout
        await interaction.deferUpdate();

        // Parse the selected value: name|tierEquivalent|slot
        const [gearName, tierEquivalent, gearSlot] = selectedValue.split('|');

        // Remove the gear from inventory
        const result = await db.removeGearFromInventory(interaction.guildId, gearName, gearSlot, tierEquivalent, 1);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription(result.error || 'Failed to remove gear from inventory.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.followUp({ embeds: [embed], ephemeral: true });
            return true;
        }

        // Refresh the regear menu with updated inventory
        const inventory = await db.getInventory(interaction.guildId);
        const inventoryBySlot = {};
        VALID_SLOTS.forEach(s => {
            inventoryBySlot[s] = inventory.filter(item => item.slot === s);
        });

        const rows = [];
        
        for (const s of VALID_SLOTS) {
            // Sort items by tier (lower first), then by name
            let slotItems = inventoryBySlot[s];
            slotItems = sortItemsByTierAndName([...slotItems]);
            
            if (slotItems.length === 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${s}`)
                    .setPlaceholder(`${s.charAt(0).toUpperCase() + s.slice(1)} - No items available`)
                    .setDisabled(true)
                    .addOptions([
                        new StringSelectMenuOptionBuilder()
                            .setLabel('No items available')
                            .setValue('none')
                            .setDescription('No items in this slot')
                    ]);
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            } else {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`regear_${s}`)
                    .setPlaceholder(`Select ${s.charAt(0).toUpperCase() + s.slice(1)} gear`)
                    .setMinValues(0)
                    .setMaxValues(1);
                
                // Track seen values to prevent duplicates
                const seenValues = new Set();
                const options = [];
                
                slotItems.forEach(item => {
                    const value = `${item.name}|${item.tierEquivalent}|${item.slot}`;
                    
                    // Skip if we've already seen this exact value
                    if (seenValues.has(value)) {
                        return;
                    }
                    
                    seenValues.add(value);
                    
                    const label = `${item.name} (${item.tierEquivalent})`;
                    const description = `Qty: ${item.quantity}${item.notes ? ` | ${item.notes}` : ''}`;
                    
                    options.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
                            .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description)
                            .setValue(value)
                    );
                });
                
                // Add all options at once
                if (options.length > 0) {
                    selectMenu.addOptions(options);
                }
                
                rows.push(new ActionRowBuilder().addComponents(selectMenu));
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🎒 Regear Request')
            .setDescription('Select the gear items you need from the dropdowns below.\nSelect one item per slot.')
            .addFields(
                { 
                    name: '✅ Gear Issued', 
                    value: `**${gearName}** (${tierEquivalent}) - ${gearSlot.charAt(0).toUpperCase() + gearSlot.slice(1)}\nRemaining Stock: ${result.remainingQuantity}`, 
                    inline: false 
                }
            )
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], components: rows });
        return true;
    }
};

