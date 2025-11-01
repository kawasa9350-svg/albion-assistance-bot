const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

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

// Helper function to parse tier equivalent
function parseTierEquivalent(tierInput) {
    // Remove T prefix if present and whitespace
    let cleaned = tierInput.trim().toUpperCase().replace(/^T/, '');
    
    // Check if it's in format like "4.3" or "4.3"
    const match = cleaned.match(/^(\d+)\.(\d+)$/);
    if (match) {
        const tier = parseInt(match[1]);
        const enchant = parseInt(match[2]);
        const tierEquivalent = tier + enchant;
        return `T${tierEquivalent}`;
    }
    
    // If it's just a number like "7" or "T7", return as T7
    const numberMatch = cleaned.match(/^(\d+)$/);
    if (numberMatch) {
        return `T${numberMatch[1]}`;
    }
    
    // If already in T7 format, return as is
    if (cleaned.match(/^T?\d+$/)) {
        return cleaned.startsWith('T') ? cleaned : `T${cleaned}`;
    }
    
    // Default: return input with T prefix if missing
    return cleaned.startsWith('T') ? cleaned : `T${cleaned}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Manage guild inventory')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add gear to inventory')
                .addStringOption(option =>
                    option.setName('slot')
                        .setDescription('Gear slot (select this first)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Head', value: 'head' },
                            { name: 'Chest', value: 'chest' },
                            { name: 'Shoes', value: 'shoes' },
                            { name: 'Main-Hand', value: 'main-hand' },
                            { name: 'Off-Hand', value: 'off-hand' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Gear name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('tier')
                        .setDescription('Tier equivalent (e.g., T4.3, 4.3, T7)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('Quantity to add')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('notes')
                        .setDescription('Optional notes')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all inventory items')
                .addStringOption(option =>
                    option.setName('slot')
                        .setDescription('Filter by slot')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Head', value: 'head' },
                            { name: 'Chest', value: 'chest' },
                            { name: 'Shoes', value: 'shoes' },
                            { name: 'Main-Hand', value: 'main-hand' },
                            { name: 'Off-Hand', value: 'off-hand' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Search for gear in inventory')
                .addStringOption(option =>
                    option.setName('slot')
                        .setDescription('Filter by slot (select this first)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Head', value: 'head' },
                            { name: 'Chest', value: 'chest' },
                            { name: 'Shoes', value: 'shoes' },
                            { name: 'Main-Hand', value: 'main-hand' },
                            { name: 'Off-Hand', value: 'off-hand' }
                        ))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Gear name to search for')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stock')
                .setDescription('Show items with low stock (less than 5)')),

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

            switch (subcommand) {
                case 'add':
                    await this.handleAdd(interaction, db);
                    break;
                case 'list':
                    await this.handleList(interaction, db);
                    break;
                case 'search':
                    await this.handleSearch(interaction, db);
                    break;
                case 'stock':
                    await this.handleStock(interaction, db);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown subcommand!', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in inventory command:', error);
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the inventory command.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            }
        }
    },

    async handleAdd(interaction, db) {
        const slot = interaction.options.getString('slot');
        const name = interaction.options.getString('name');
        const tierInput = interaction.options.getString('tier');
        const quantity = interaction.options.getInteger('quantity');
        const notes = interaction.options.getString('notes') || '';

        // Parse tier equivalent
        const tierEquivalent = parseTierEquivalent(tierInput);

        const gearData = {
            name: name,
            slot: slot,
            tierEquivalent: tierEquivalent,
            quantity: quantity,
            notes: notes
        };

        const success = await db.addGearToInventory(interaction.guildId, gearData);

        if (success) {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Gear Added to Inventory')
                .addFields(
                    { name: 'Name', value: name, inline: true },
                    { name: 'Slot', value: slot.charAt(0).toUpperCase() + slot.slice(1), inline: true },
                    { name: 'Tier Equivalent', value: tierEquivalent, inline: true },
                    { name: 'Quantity', value: quantity.toString(), inline: true },
                    { name: 'Notes', value: notes || 'None', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('Failed to add gear to inventory.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },

    async handleList(interaction, db) {
        const slotFilter = interaction.options.getString('slot');

        const inventory = await db.getInventory(interaction.guildId, slotFilter);

        if (inventory.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('📦 Inventory Empty')
                .setDescription(slotFilter 
                    ? `No items found for slot: ${slotFilter}`
                    : 'No items in inventory.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // Group by slot
        const grouped = {};
        inventory.forEach(item => {
            if (!grouped[item.slot]) {
                grouped[item.slot] = [];
            }
            grouped[item.slot].push(item);
        });

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📦 Inventory List')
            .setDescription(slotFilter ? `Items in ${slotFilter} slot:` : 'All inventory items:')
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        // Discord embed fields have a limit, so we'll format efficiently
        let fields = [];
        for (const [slot, items] of Object.entries(grouped)) {
            // Sort items by tier (lower first), then by name
            const sortedItems = sortItemsByTierAndName([...items]);
            let slotText = '';
            
            sortedItems.forEach(item => {
                slotText += `• ${item.name} (${item.tierEquivalent}) - Qty: ${item.quantity}`;
                if (item.notes) {
                    slotText += ` - ${item.notes}`;
                }
                slotText += '\n';
            });
            
            // Split into chunks if too long (Discord field value limit is 1024)
            if (slotText.length > 1024) {
                const chunks = slotText.match(/.{1,1000}/g) || [];
                chunks.forEach((chunk, index) => {
                    fields.push({
                        name: index === 0 ? formatSlotName(slot) : '\u200B',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                fields.push({
                    name: formatSlotName(slot),
                    value: slotText,
                    inline: false
                });
            }
        }

        // Split into multiple embeds if needed (Discord allows max 6000 characters total)
        if (fields.length > 0) {
            embed.addFields(fields.slice(0, 25)); // Max 25 fields per embed
        }

        await interaction.reply({ embeds: [embed] });
    },

    async handleSearch(interaction, db) {
        const slot = interaction.options.getString('slot');
        const searchName = interaction.options.getString('name');

        const inventory = await db.getInventory(interaction.guildId, slot, null, searchName);

        if (inventory.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('🔍 Search Results')
                .setDescription(`No items found matching: "${searchName}"`)
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // Sort items by tier (lower first), then by name
        const sortedInventory = sortItemsByTierAndName([...inventory]);

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🔍 Search Results')
            .setDescription(`Found ${inventory.length} item(s) matching "${searchName}":`)
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        let fields = [];
        sortedInventory.forEach(item => {
            fields.push({
                name: `${item.name} (${item.tierEquivalent})`,
                value: `Slot: ${item.slot.charAt(0).toUpperCase() + item.slot.slice(1)}\nQuantity: ${item.quantity}${item.notes ? `\nNotes: ${item.notes}` : ''}`,
                inline: true
            });
        });

        embed.addFields(fields);

        await interaction.reply({ embeds: [embed] });
    },

    async handleStock(interaction, db) {
        // Get all inventory items
        const inventory = await db.getInventory(interaction.guildId);

        // Filter items with quantity less than 5
        const lowStockItems = inventory.filter(item => item.quantity < 5);

        if (lowStockItems.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Stock Status')
                .setDescription('All items have sufficient stock (5 or more)!')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // Sort by quantity (lowest first)
        lowStockItems.sort((a, b) => a.quantity - b.quantity);

        // Group by slot
        const grouped = {};
        lowStockItems.forEach(item => {
            if (!grouped[item.slot]) {
                grouped[item.slot] = [];
            }
            grouped[item.slot].push(item);
        });

        const embed = new EmbedBuilder()
            .setColor('#FFAA00')
            .setTitle('⚠️ Low Stock Alert')
            .setDescription(`Found ${lowStockItems.length} item(s) with less than 5 in stock:`)
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp();

        let fields = [];
        for (const [slot, items] of Object.entries(grouped)) {
            let slotText = '';
            
            items.forEach(item => {
                const stockLevel = item.quantity === 0 ? '🔴 OUT OF STOCK' : 
                                  item.quantity === 1 ? '🟠 Critical' : 
                                  item.quantity <= 2 ? '🟡 Very Low' : '🟢 Low';
                
                slotText += `• **${item.name}** (${item.tierEquivalent}) - **${item.quantity}** ${stockLevel}`;
                if (item.notes) {
                    slotText += `\n  └ ${item.notes}`;
                }
                slotText += '\n';
            });
            
            // Split into chunks if too long (Discord field value limit is 1024)
            if (slotText.length > 1024) {
                const chunks = slotText.match(/.{1,1000}/g) || [];
                chunks.forEach((chunk, index) => {
                    fields.push({
                        name: index === 0 ? slot.charAt(0).toUpperCase() + slot.slice(1) : '\u200B',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                fields.push({
                    name: slot.charAt(0).toUpperCase() + slot.slice(1),
                    value: slotText || 'No items',
                    inline: false
                });
            }
        }

        // Add fields (max 25 per embed)
        if (fields.length > 0) {
            embed.addFields(fields.slice(0, 25));
        }

        await interaction.reply({ embeds: [embed] });
    },

    async autocomplete(interaction) {
        try {
            const focusedOption = interaction.options.getFocused(true);
            const focusedValue = focusedOption.value;
            
            // Only handle autocomplete for 'name' options
            if (focusedOption.name !== 'name') {
                await interaction.respond([]);
                return;
            }
            
            // Get the command to access its database manager
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command || !command.dbManager) {
                console.error('Command or database manager not found for autocomplete');
                await interaction.respond([]);
                return;
            }
            
            const db = command.dbManager;
            
            // Check if guild is registered
            if (!(await db.isGuildRegistered(interaction.guildId))) {
                await interaction.respond([]);
                return;
            }

            // Get the selected slot from options
            const selectedSlot = interaction.options.getString('slot');
            
            // Get inventory items filtered by slot if slot is selected
            const inventory = await db.getInventory(interaction.guildId, selectedSlot || null);
            
            // Extract unique item names (case-insensitive) from filtered inventory
            const uniqueNames = new Set();
            inventory.forEach(item => {
                uniqueNames.add(item.name);
            });
            
            // Convert to array and filter based on user input
            let filtered = Array.from(uniqueNames);
            
            if (focusedValue && focusedValue.length > 0) {
                filtered = filtered.filter(name => 
                    name.toLowerCase().includes(focusedValue.toLowerCase())
                );
            }
            
            // Sort alphabetically and limit to 25 choices (Discord max)
            filtered = filtered.sort().slice(0, 25);

            // Create autocomplete choices
            const choices = filtered.map(name => ({
                name: name,
                value: name
            }));

            await interaction.respond(choices);
        } catch (error) {
            console.error('Error in inventory autocomplete:', error);
            await interaction.respond([]);
        }
    }
};

// Export the helper function for use in regear command
module.exports.parseTierEquivalent = parseTierEquivalent;

