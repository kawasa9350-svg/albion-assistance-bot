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
            const items = [];
            for (const slot of VALID_SLOTS) {
                if (selections[slot]) {
                    hasSelections = true;
                    items.push({
                        slot: slot,
                        name: selections[slot].name,
                        tierEquivalent: selections[slot].tierEquivalent
                    });
                }
            }

            if (!hasSelections) {
                await interaction.reply({ content: 'No items selected to confirm.', ephemeral: true });
                return true;
            }

            await interaction.deferUpdate();

            // Get tier, issuer, and recipient info
            const selectedTier = selections.selectedTier || 'Unknown';
            const issuer = interaction.user;
            const recipientId = selections.targetUserId || 'Unknown';
            const recipientTag = selections.targetUserTag || 'Unknown';

            // Create reservation
            const reservationResult = await db.createRegearReservation(interaction.guildId, {
                issuerId: issuer.id,
                issuerTag: issuer.tag,
                recipientId: recipientId,
                recipientTag: recipientTag,
                items: items,
                selectedTier: selectedTier
            });

            if (!reservationResult.success) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription(`Failed to create reservation: ${reservationResult.error}`)
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                return true;
            }

            const regearId = reservationResult.regearId;

            // Build reservation embed for issuer
            const reservationEmbed = await this.buildReservationEmbed(interaction, db, reservationResult.reservation, 'RESERVED');
            
            // Create buttons for issuer
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`regear_confirm_pickup_${regearId}`)
                        .setLabel('✅ Confirm Pickup')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`regear_cancel_reservation_${regearId}`)
                        .setLabel('❌ Cancel Reservation')
                        .setStyle(ButtonStyle.Danger)
                );

            // Send reservation message
            const reservationMessage = await interaction.followUp({ 
                embeds: [reservationEmbed], 
                components: [buttonRow],
                ephemeral: false 
            });

            // Update reservation with message ID and channel ID
            await db.updateRegearStatus(interaction.guildId, regearId, 'RESERVED', {
                reservationMessageId: reservationMessage.id,
                reservationChannelId: interaction.channel.id
            });

            // Send notification to recipient
            await this.sendRecipientNotification(interaction, db, reservationResult.reservation);

            // Log to regear log channel if configured and store the log message ID
            const logMessageId = await this.logRegearReservationToChannel(interaction, db, reservationResult.reservation, 'RESERVED');
            if (logMessageId) {
                await db.updateRegearStatus(interaction.guildId, regearId, 'RESERVED', {
                    logMessageId: logMessageId
                });
            }

            // Update original message to show it's reserved
            const reservedEmbed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('🟡 Regear Reserved')
                .setDescription('Items have been reserved. See the message above for details.')
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [reservedEmbed], components: [] });
            return true;
        } else if (customId === 'regear_cancel') {
            await interaction.deferUpdate();
            
            // Reset to initial state (page 1)
            await this.showRegearMenu(interaction, db, {});
            return true;
        } else if (customId.startsWith('regear_confirm_pickup_')) {
            // Handle confirm pickup button
            const regearId = customId.replace('regear_confirm_pickup_', '');
            console.log(`Confirm pickup button clicked for regearId: ${regearId}`);
            if (!regearId || regearId.length === 0) {
                await interaction.reply({ content: '❌ Invalid regear ID.', ephemeral: true });
                return true;
            }
            await this.handleConfirmPickup(interaction, db, regearId);
            return true;
        } else if (customId.startsWith('regear_cancel_reservation_')) {
            // Handle cancel reservation button
            const regearId = customId.replace('regear_cancel_reservation_', '');
            console.log(`Cancel reservation button clicked for regearId: ${regearId}`);
            if (!regearId || regearId.length === 0) {
                await interaction.reply({ content: '❌ Invalid regear ID.', ephemeral: true });
                return true;
            }
            await this.handleCancelReservation(interaction, db, regearId);
            return true;
        } else if (customId.startsWith('regear_recipient_picked_up_')) {
            // Handle recipient picked up button (optional)
            const regearId = customId.replace('regear_recipient_picked_up_', '');
            console.log(`Recipient picked up button clicked for regearId: ${regearId}`);
            if (!regearId || regearId.length === 0) {
                await interaction.reply({ content: '❌ Invalid regear ID.', ephemeral: true });
                return true;
            }
            await this.handleRecipientPickedUp(interaction, db, regearId);
            return true;
        }

        return false;
    },

    async buildReservationEmbed(interaction, db, reservation, status) {
        const statusEmoji = status === 'RESERVED' ? '🟡' : status === 'PICKED_UP' ? '🟢' : status === 'COMPLETED' ? '✅' : '❌';
        const statusText = status === 'RESERVED' ? 'RESERVED - Waiting for pickup' : 
                          status === 'PICKED_UP' ? 'PICKED UP - Awaiting confirmation' :
                          status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
        const color = status === 'RESERVED' ? '#FFAA00' : status === 'PICKED_UP' ? '#00AA00' : status === 'COMPLETED' ? '#00FF00' : '#FF0000';
        const title = status === 'RESERVED' ? '🟡 Regear Reserved' : 
                     status === 'PICKED_UP' ? '🟢 Regear Picked Up' :
                     status === 'COMPLETED' ? '✅ Regear Completed' : '❌ Regear Cancelled';

        // Build items list
        let itemsText = '';
        reservation.items.forEach(item => {
                    let slotEmoji = '🎒';
            if (item.slot === 'head') slotEmoji = '🪖';
            else if (item.slot === 'chest') slotEmoji = '🦺';
            else if (item.slot === 'shoes') slotEmoji = '👟';
            else if (item.slot === 'main-hand') slotEmoji = '⚔️';
            else if (item.slot === 'off-hand') slotEmoji = '🛡️';
            
            itemsText += `${slotEmoji} **${formatSlotName(item.slot)}:** ${item.name} (${item.tierEquivalent})\n`;
        });

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(status === 'RESERVED' ? '✅ Items have been reserved for pickup' :
                           status === 'PICKED_UP' ? '🟢 Recipient has picked up items. Confirm to complete.' :
                           status === 'COMPLETED' ? '✅ Items have been removed from inventory' :
                           '❌ Reservation has been cancelled')
            .addFields(
                { name: '👤 Recipient', value: `<@${reservation.recipientId}>`, inline: true },
                { name: '⚡ Tier', value: reservation.selectedTier || 'Unknown', inline: true },
                { name: '📊 Status', value: `${statusEmoji} ${statusText}`, inline: true },
                { name: '🎒 Reserved Items', value: itemsText || 'No items', inline: false }
            )
            .setFooter({ text: 'Phoenix Assistance Bot' })
            .setTimestamp(reservation.reservedAt || new Date());

        if (reservation.completedAt) {
            embed.addFields({ name: '📅 Completed', value: `<t:${Math.floor(reservation.completedAt.getTime() / 1000)}:R>`, inline: true });
        }

        return embed;
    },

    async sendRecipientNotification(interaction, db, reservation) {
        try {
            const recipient = await interaction.client.users.fetch(reservation.recipientId).catch(() => null);
            if (!recipient) {
                console.error(`Failed to fetch recipient user: ${reservation.recipientId}`);
                return;
            }

            // Build items list
            let itemsText = '';
            reservation.items.forEach(item => {
                let slotEmoji = '🎒';
                if (item.slot === 'head') slotEmoji = '🪖';
                else if (item.slot === 'chest') slotEmoji = '🦺';
                else if (item.slot === 'shoes') slotEmoji = '👟';
                else if (item.slot === 'main-hand') slotEmoji = '⚔️';
                else if (item.slot === 'off-hand') slotEmoji = '🛡️';
                
                itemsText += `${slotEmoji} **${formatSlotName(item.slot)}:** ${item.name} (${item.tierEquivalent})\n`;
            });

            const embed = new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('🎒 Regear Ready for Pickup!')
                .setDescription(`<@${reservation.recipientId}>, your regear has been reserved!\n\n**📞 Please contact an officer to collect your regear.**`)
                .addFields(
                    { name: '👤 Issued by', value: `<@${reservation.issuerId}>`, inline: true },
                    { name: '⚡ Tier', value: reservation.selectedTier || 'Unknown', inline: true },
                    { name: '📊 Status', value: '🟡 Ready for Pickup', inline: true },
                    { name: '🎒 Your Reserved Items', value: itemsText || 'No items', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
            
            // Create button for recipient to mark as picked up
            const recipientButtonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`regear_recipient_picked_up_${reservation.regearId}`)
                        .setLabel('✅ I\'ve Picked Up')
                        .setStyle(ButtonStyle.Success)
                );

            // Try to send DM, fallback to mentioning in channel
            try {
                const dmMessage = await recipient.send({ embeds: [embed], components: [recipientButtonRow] });
                // Store recipient message ID
                await db.updateRegearStatus(interaction.guildId, reservation.regearId, 'RESERVED', {
                    recipientMessageId: dmMessage.id
                });
                console.log(`✅ Sent regear notification DM to ${recipient.tag}`);
            } catch (dmError) {
                // If DM fails, mention in the channel where reservation was created
                console.log(`⚠️ Could not send DM to ${recipient.tag}, will mention in channel`);
                // Update embed to mention them
                embed.setDescription(`<@${reservation.recipientId}>, your regear has been reserved!\n\n**📞 Please contact an officer to collect your regear.**`);
                try {
                    const channelMessage = await interaction.channel.send({ 
                        embeds: [embed], 
                        components: [recipientButtonRow],
                        content: `<@${reservation.recipientId}>`
                    });
                    // Store recipient message ID
                    await db.updateRegearStatus(interaction.guildId, reservation.regearId, 'RESERVED', {
                        recipientMessageId: channelMessage.id
                    });
                } catch (channelError) {
                    console.error('Failed to send channel message:', channelError);
                }
            }
        } catch (error) {
            console.error('❌ Failed to send recipient notification:', error);
        }
    },

    async deleteReservationMessage(client, reservation) {
        try {
            console.log(`Attempting to delete reservation message: ${reservation.reservationMessageId} from channel: ${reservation.reservationChannelId}`);
            
            const guild = await client.guilds.fetch(reservation.guildId).catch((err) => {
                console.error(`Failed to fetch guild ${reservation.guildId}:`, err);
                return null;
            });
            
            if (!guild) {
                console.error(`Guild ${reservation.guildId} not found`);
                return false;
            }
            
            const reservationChannel = await guild.channels.fetch(reservation.reservationChannelId).catch((err) => {
                console.error(`Failed to fetch channel ${reservation.reservationChannelId}:`, err);
                return null;
            });
            
            if (!reservationChannel) {
                console.error(`Channel ${reservation.reservationChannelId} not found`);
                return false;
            }
            
            const reservationMessage = await reservationChannel.messages.fetch(reservation.reservationMessageId).catch((err) => {
                console.error(`Failed to fetch message ${reservation.reservationMessageId}:`, err);
                return null;
            });
            
            if (reservationMessage) {
                await reservationMessage.delete().catch((err) => {
                    console.error(`Failed to delete message ${reservation.reservationMessageId}:`, err);
                });
                console.log(`✅ Successfully deleted reservation message ${reservation.reservationMessageId} after completion`);
                return true;
            } else {
                console.log(`⚠️ Reservation message ${reservation.reservationMessageId} not found (may have been already deleted)`);
                return false;
            }
        } catch (error) {
            console.error('Error in deleteReservationMessage:', error);
            return false;
        }
    },

    async checkRegearPermission(interaction, db, guildId) {
        // If in DM, we can't check permissions properly - deny access
        // These buttons should only be used in guild channels
        if (!interaction.guild || !interaction.member) {
            console.log(`Permission check failed: Not in guild context for user ${interaction.user.id}`);
            return false;
        }

        const member = interaction.member;
        let hasPermission = false;
        
        // Check if user is admin
        if (member.permissions.has('Administrator')) {
            hasPermission = true;
            console.log(`User ${interaction.user.id} has Administrator permission for regear`);
        } else {
            // Check if user has regear permission directly
            try {
                const userHasPermission = await db.hasPermission(guildId, member.id, 'regear');
                if (userHasPermission) {
                    hasPermission = true;
                    console.log(`User ${interaction.user.id} has direct regear permission`);
                }
            } catch (error) {
                console.error('Error checking user permission:', error);
            }
            
            // Check if any of user's roles have regear permission
            if (!hasPermission) {
                for (const role of member.roles.cache.values()) {
                    try {
                        const roleHasPermission = await db.hasPermission(guildId, role.id, 'regear');
                        if (roleHasPermission) {
                            hasPermission = true;
                            console.log(`User ${interaction.user.id} has regear permission through role: ${role.name}`);
                            break;
                        }
                    } catch (error) {
                        console.error(`Error checking role ${role.id} permission:`, error);
                    }
                }
            }
        }

        return hasPermission;
    },

    async handleConfirmPickup(interaction, db, regearId) {
        try {
            // Defer the interaction first
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const reservation = await db.getRegearReservation(interaction.guildId, regearId);
            if (!reservation) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Reservation not found.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Reservation not found.', ephemeral: true });
                }
                return;
            }

            // Get guildId from reservation if needed (for DM interactions)
            const guildId = reservation.guildId || interaction.guildId;

            // Check if user has regear permission or is the issuer
            const hasPermission = await this.checkRegearPermission(interaction, db, guildId);
            const isIssuer = interaction.user.id === reservation.issuerId;
            
            if (!hasPermission && !isIssuer) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You do not have permission to confirm regear pickups.\n\n**Required:** Administrator role, regear permission, or be the issuer')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            // Check if already completed
            if (reservation.status === 'COMPLETED') {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ This reservation is already completed.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ This reservation is already completed.', ephemeral: true });
                }
                return;
            }

            if (reservation.status === 'CANCELLED') {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ This reservation was cancelled.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ This reservation was cancelled.', ephemeral: true });
                }
                return;
            }

            // Complete the reservation (remove items from inventory)
            const completeResult = await db.completeRegearReservation(interaction.guildId, regearId);

            if (!completeResult.success) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: `❌ Failed to complete reservation: ${completeResult.error}`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `❌ Failed to complete reservation: ${completeResult.error}`, ephemeral: true });
                }
                return;
            }

            // Get updated reservation
            const updatedReservation = await db.getRegearReservation(interaction.guildId, regearId);

            // Build completed embed
            const completedEmbed = await this.buildReservationEmbed(interaction, db, updatedReservation, 'COMPLETED');

            // Update the message
            try {
                await interaction.message.edit({ embeds: [completedEmbed], components: [] });
            } catch (editError) {
                console.error('Failed to edit message:', editError);
            }

            // Update recipient message if it exists (try in current channel first, then try DM)
            if (reservation.recipientMessageId) {
                try {
                    // Try to update in current channel first
                    const recipientMessage = await interaction.channel.messages.fetch(reservation.recipientMessageId).catch(() => null);
                    if (recipientMessage) {
                        const recipientEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Regear Completed')
                            .setDescription('Your regear has been completed!')
                            .addFields(
                                { name: '👤 Issued by', value: `<@${reservation.issuerId}>`, inline: true },
                                { name: '⚡ Tier', value: reservation.selectedTier || 'Unknown', inline: true },
                                { name: '📊 Status', value: '✅ COMPLETED', inline: true }
                            )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();
                        await recipientMessage.edit({ embeds: [recipientEmbed], components: [] });
                    } else {
                        // If not in current channel, it might be a DM - try to send a new DM
                        try {
                            const recipient = await interaction.client.users.fetch(reservation.recipientId).catch(() => null);
                            if (recipient) {
                                const recipientEmbed = new EmbedBuilder()
                                    .setColor('#00FF00')
                                    .setTitle('✅ Regear Completed')
                                    .setDescription('Your regear has been completed!')
                                    .addFields(
                                        { name: '👤 Issued by', value: `<@${reservation.issuerId}>`, inline: true },
                                        { name: '⚡ Tier', value: reservation.selectedTier || 'Unknown', inline: true },
                                        { name: '📊 Status', value: '✅ COMPLETED', inline: true }
                                    )
                                    .setFooter({ text: 'Phoenix Assistance Bot' })
                                    .setTimestamp();
                                await recipient.send({ embeds: [recipientEmbed] });
                            }
                        } catch (dmError) {
                            // DM update failed, that's okay
                            console.log('Could not update recipient via DM');
                        }
                    }
                } catch (error) {
                    console.error('Failed to update recipient message:', error);
                }
            }

            // Log to channel
            try {
                await this.logRegearReservationToChannel(interaction, db, updatedReservation, 'COMPLETED', completeResult.results);
            } catch (logError) {
                console.error('Failed to log to channel:', logError);
            }

            // Delete the log message from regear logs channel to reduce spam
            if (reservation.logMessageId) {
                try {
                    const guildId = reservation.guildId || interaction.guildId;
                    const logChannelId = await db.getRegearLogChannel(guildId);
                    if (logChannelId) {
                        const guild = interaction.guild || await interaction.client.guilds.fetch(guildId).catch(() => null);
                        if (guild) {
                            const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
                            if (logChannel) {
                                const logMessage = await logChannel.messages.fetch(reservation.logMessageId).catch(() => null);
                                if (logMessage) {
                                    await logMessage.delete().catch((err) => {
                                        console.error(`Failed to delete log message ${reservation.logMessageId}:`, err);
                                    });
                                    console.log(`✅ Successfully deleted log message ${reservation.logMessageId} from regear logs channel`);
                                } else {
                                    console.log(`⚠️ Log message ${reservation.logMessageId} not found (may have been already deleted)`);
                                }
                            }
                        }
                    }
                } catch (deleteError) {
                    console.error('Failed to delete log message:', deleteError);
                }
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '✅ Regear completed successfully!', ephemeral: true });
            } else {
                await interaction.reply({ content: '✅ Regear completed successfully!', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in handleConfirmPickup:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ An error occurred while processing the pickup confirmation.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred while processing the pickup confirmation.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },

    async handleCancelReservation(interaction, db, regearId) {
        try {
            // Defer the interaction first
            if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
            }

            const reservation = await db.getRegearReservation(interaction.guildId, regearId);
            if (!reservation) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Reservation not found.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Reservation not found.', ephemeral: true });
                }
                return;
            }

            // Get guildId from reservation if needed (for DM interactions)
            const guildId = reservation.guildId || interaction.guildId;

            // Check if user has regear permission or is the issuer
            const hasPermission = await this.checkRegearPermission(interaction, db, guildId);
            const isIssuer = interaction.user.id === reservation.issuerId;
            
            if (!hasPermission && !isIssuer) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Permission Denied')
                    .setDescription('You do not have permission to cancel regear reservations.\n\n**Required:** Administrator role, regear permission, or be the issuer')
                    .setFooter({ text: 'Phoenix Assistance Bot' })
                    .setTimestamp();
                
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ embeds: [embed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                }
                return;
            }

            // Check if already completed
            if (reservation.status === 'COMPLETED') {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Cannot cancel a completed reservation.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Cannot cancel a completed reservation.', ephemeral: true });
                }
                return;
            }

            if (reservation.status === 'CANCELLED') {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ This reservation is already cancelled.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ This reservation is already cancelled.', ephemeral: true });
                }
                return;
            }

            // Cancel the reservation
            const cancelResult = await db.cancelRegearReservation(guildId, regearId);

            if (!cancelResult.success) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: `❌ Failed to cancel reservation: ${cancelResult.error}`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `❌ Failed to cancel reservation: ${cancelResult.error}`, ephemeral: true });
                }
                return;
            }

            // Get updated reservation
            const updatedReservation = await db.getRegearReservation(guildId, regearId);

            // Build cancelled embed
            const cancelledEmbed = await this.buildReservationEmbed(interaction, db, updatedReservation, 'CANCELLED');

            // Update the message
            try {
                await interaction.message.edit({ embeds: [cancelledEmbed], components: [] });
            } catch (editError) {
                console.error('Failed to edit message:', editError);
            }

            // Log to channel
            try {
                await this.logRegearReservationToChannel(interaction, db, updatedReservation, 'CANCELLED');
            } catch (logError) {
                console.error('Failed to log to channel:', logError);
            }

            // Delete the log message from regear logs channel to reduce spam
            if (reservation.logMessageId) {
                try {
                    const guildIdForLog = reservation.guildId || interaction.guildId;
                    const logChannelId = await db.getRegearLogChannel(guildIdForLog);
                    if (logChannelId) {
                        const guild = interaction.guild || await interaction.client.guilds.fetch(guildIdForLog).catch(() => null);
                        if (guild) {
                            const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
                            if (logChannel) {
                                const logMessage = await logChannel.messages.fetch(reservation.logMessageId).catch(() => null);
                                if (logMessage) {
                                    await logMessage.delete().catch((err) => {
                                        console.error(`Failed to delete log message ${reservation.logMessageId}:`, err);
                                    });
                                    console.log(`✅ Successfully deleted log message ${reservation.logMessageId} from regear logs channel after cancellation`);
                                } else {
                                    console.log(`⚠️ Log message ${reservation.logMessageId} not found (may have been already deleted)`);
                                }
                            }
                        }
                    }
                } catch (deleteError) {
                    console.error('Failed to delete log message:', deleteError);
                }
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '❌ Reservation cancelled.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Reservation cancelled.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in handleCancelReservation:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ An error occurred while processing the cancellation.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred while processing the cancellation.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },

    async handleRecipientPickedUp(interaction, db, regearId) {
        try {
            // Defer the interaction first
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Get reservation (works even if guildId is null for DM interactions)
            const reservation = await db.getRegearReservation(interaction.guildId, regearId);
            if (!reservation) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Reservation not found.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Reservation not found.', ephemeral: true });
                }
                return;
            }

            // Get guildId from reservation (needed for DM interactions)
            const guildId = reservation.guildId;

            // Check if user is the recipient
            if (interaction.user.id !== reservation.recipientId) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ Only the recipient can mark items as picked up.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Only the recipient can mark items as picked up.', ephemeral: true });
                }
                return;
            }

            // Check if already completed or cancelled
            if (reservation.status === 'COMPLETED' || reservation.status === 'CANCELLED') {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: `❌ This reservation is already ${reservation.status.toLowerCase()}.`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `❌ This reservation is already ${reservation.status.toLowerCase()}.`, ephemeral: true });
                }
                return;
            }

            // Update status to PICKED_UP (pass null guildId, function will find it)
            await db.updateRegearStatus(guildId, regearId, 'PICKED_UP');

            // Get updated reservation
            const updatedReservation = await db.getRegearReservation(guildId, regearId);

            // Build picked up embed
            const pickedUpEmbed = await this.buildReservationEmbed(interaction, db, updatedReservation, 'PICKED_UP');

            // Update the message
            try {
                await interaction.message.edit({ embeds: [pickedUpEmbed], components: [] });
            } catch (editError) {
                console.error('Failed to edit message:', editError);
            }

            // Update issuer's message if it exists
            if (reservation.reservationMessageId && reservation.reservationChannelId) {
                try {
                    // Get the guild from the reservation
                    const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
                    if (guild) {
                        const issuerChannel = await guild.channels.fetch(reservation.reservationChannelId).catch(() => null);
                        if (issuerChannel) {
                            const issuerMessage = await issuerChannel.messages.fetch(reservation.reservationMessageId).catch(() => null);
                            if (issuerMessage) {
                                const issuerEmbed = await this.buildReservationEmbed(interaction, db, updatedReservation, 'PICKED_UP');
                                const buttonRow = new ActionRowBuilder()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`regear_confirm_pickup_${regearId}`)
                                            .setLabel('✅ Confirm Pickup')
                                            .setStyle(ButtonStyle.Success),
                                        new ButtonBuilder()
                                            .setCustomId(`regear_cancel_reservation_${regearId}`)
                                            .setLabel('❌ Cancel Reservation')
                                            .setStyle(ButtonStyle.Danger)
                                    );
                                await issuerMessage.edit({ embeds: [issuerEmbed], components: [buttonRow] });
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to update issuer message:', error);
                }
            }

            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: '✅ You\'ve marked items as picked up. Waiting for issuer confirmation.', ephemeral: true });
            } else {
                await interaction.reply({ content: '✅ You\'ve marked items as picked up. Waiting for issuer confirmation.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in handleRecipientPickedUp:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({ content: '❌ An error occurred while processing the pickup confirmation.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred while processing the pickup confirmation.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send error message:', replyError);
            }
        }
    },

    async logRegearReservationToChannel(interaction, db, reservation, status, results = null) {
        try {
            // Get guildId from reservation if interaction doesn't have it (for DM interactions)
            const guildId = reservation.guildId || interaction.guildId;
            if (!guildId) {
                console.error('No guildId available for logging');
                return null;
            }

            const logChannelId = await db.getRegearLogChannel(guildId);
            if (!logChannelId) {
                return null; // No log channel configured
            }

            // Get guild to fetch channel
            const guild = interaction.guild || await interaction.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                console.error(`Guild ${guildId} not found for logging`);
                return null;
            }

            const logChannel = await guild.channels.fetch(logChannelId);
            if (!logChannel) {
                console.error(`Regear log channel ${logChannelId} not found in guild ${guildId}`);
                return null;
            }

            const statusEmoji = status === 'RESERVED' ? '🟡' : status === 'PICKED_UP' ? '🟢' : status === 'COMPLETED' ? '✅' : '❌';
            const statusText = status === 'RESERVED' ? 'RESERVED' : status === 'PICKED_UP' ? 'PICKED UP' : status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
            const color = status === 'RESERVED' ? '#FFAA00' : status === 'PICKED_UP' ? '#00AA00' : status === 'COMPLETED' ? '#00FF00' : '#FF0000';

            // Build regear details
            let regearDetails = '';
            const itemsToShow = results || reservation.items;
            for (const item of itemsToShow) {
                regearDetails += `• **${formatSlotName(item.slot)}:** ${item.name} (${item.tierEquivalent})\n`;
            }

            const logEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`🎒 Regear ${statusText}`)
                .addFields(
                    { name: 'Issued By', value: `<@${reservation.issuerId}>`, inline: true },
                    { name: 'Recipient', value: `<@${reservation.recipientId}>`, inline: true },
                    { name: 'Tier', value: reservation.selectedTier || 'Unknown', inline: true },
                    { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true },
                    { name: 'Regear Details', value: regearDetails || 'No items', inline: false }
                )
                .setFooter({ text: 'Phoenix Assistance Bot' })
                .setTimestamp();

            if (reservation.completedAt) {
                logEmbed.addFields({ name: 'Completed', value: `<t:${Math.floor(reservation.completedAt.getTime() / 1000)}:R>`, inline: true });
            }

            // Build CSV if completed
            if (status === 'COMPLETED' && results) {
                const date = new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const gearBySlot = {
                    'main-hand': '',
                    'off-hand': '',
                    'head': '',
                    'chest': '',
                    'shoes': ''
                };
                
                for (const item of results) {
                    const gearName = `${item.name} (${item.tierEquivalent})`;
                    gearBySlot[item.slot] = gearName;
                }

                const escapeCSV = (value) => {
                    if (!value) return '';
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                };
                
                const csvRow = [
                    date,
                    escapeCSV(reservation.recipientTag),
                    escapeCSV(gearBySlot['main-hand'] || ''),
                    escapeCSV(gearBySlot['off-hand'] || ''),
                    escapeCSV(gearBySlot['head'] || ''),
                    escapeCSV(gearBySlot['chest'] || ''),
                    escapeCSV(gearBySlot['shoes'] || ''),
                    escapeCSV(reservation.selectedTier),
                    escapeCSV(reservation.issuerTag)
                ].join(',');

                const csvContent = csvRow + '\n';
                const csvBuffer = Buffer.from(csvContent, 'utf-8');
                
                const csvAttachment = {
                    attachment: csvBuffer,
                    name: `regear_${Date.now()}.csv`
                };

                const logMessage = await logChannel.send({ 
                    embeds: [logEmbed],
                    files: [csvAttachment]
                });
                return logMessage.id;
            } else {
                const logMessage = await logChannel.send({ embeds: [logEmbed] });
                return logMessage.id;
            }
        } catch (error) {
            console.error('Error logging regear reservation to channel:', error);
            return null;
        }
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

            // Get issuer info (only show mention, no username/tag)
            const issuer = interaction.user;
            const issuerInfo = `<@${issuer.id}>`;

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
            
            // Format as CSV (comma-separated values) - no headers as requested
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

            // Create CSV file as Buffer
            const csvContent = csvRow + '\n';
            const csvBuffer = Buffer.from(csvContent, 'utf-8');
            
            // Create attachment
            const csvAttachment = {
                attachment: csvBuffer,
                name: `regear_${Date.now()}.csv`
            };

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

            // Send embed with CSV file attachment
            await logChannel.send({ 
                embeds: [logEmbed],
                files: [csvAttachment]
            });
        } catch (error) {
            console.error('Error logging regear to channel:', error);
            // Don't throw - logging failure shouldn't break the regear process
        }
    }
};
