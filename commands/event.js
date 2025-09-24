const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} = require('discord.js');

// Simple in-memory state for the create wizard keyed by userId
const createWizardState = new Map();

function buildMonthSelect() {
	const months = [
		{ label: 'January', value: '1' },
		{ label: 'February', value: '2' },
		{ label: 'March', value: '3' },
		{ label: 'April', value: '4' },
		{ label: 'May', value: '5' },
		{ label: 'June', value: '6' },
		{ label: 'July', value: '7' },
		{ label: 'August', value: '8' },
		{ label: 'September', value: '9' },
		{ label: 'October', value: '10' },
		{ label: 'November', value: '11' },
		{ label: 'December', value: '12' }
	];

	return new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('event_create_month')
			.setPlaceholder('Select month')
			.addOptions(months)
	);
}

function daysInMonth(year, monthNumber) {
	return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function buildDaySelect(year, monthNumber) {
	const totalDays = daysInMonth(year, monthNumber);
	const options = [];
	for (let day = 1; day <= totalDays; day++) {
		options.push({ label: `${day}`, value: `${day}` });
	}

	return new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('event_create_day')
			.setPlaceholder('Select day')
			.addOptions(options)
	);
}

function buildTimeModal() {
	const modal = new ModalBuilder()
		.setCustomId('event_modal_time')
		.setTitle('Enter time in UTC');

	const timeInput = new TextInputBuilder()
		.setCustomId('event_time_input')
		.setLabel('Time (24h, e.g., 19:30) UTC')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(5);

	const firstRow = new ActionRowBuilder().addComponents(timeInput);
	modal.addComponents(firstRow);
	return modal;
}

function toUnixSeconds(date) {
	return Math.floor(date.getTime() / 1000);
}

function buildContentTypeSelect(contentTypes) {
	const baseOptions = [
		{ label: 'No Content Type', value: 'none', emoji: '📄' },
		{ label: 'General', value: 'General', emoji: '📄' }
	];
	const dynamic = (contentTypes || []).map(ct => ({ label: ct, value: ct, emoji: '🎯' }));
	return new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('event_content_type_select')
			.setPlaceholder('Select content type (optional)')
			.addOptions([...baseOptions, ...dynamic])
	);
}

function buildCompSelect(comps) {
	const options = [
		{ label: 'No Comp Sheet', value: 'none', emoji: '📄' },
		...comps.map(c => ({ label: c.name || 'Unnamed Composition', value: c.name || 'Unnamed Composition', emoji: '🎭', description: `${(c.builds?.length)||0} builds | ${c.contentType || 'Unknown'}` }))
	];
	const menu = new StringSelectMenuBuilder()
		.setCustomId('event_comp_select')
		.setPlaceholder('Select Comp Sheet (optional)')
		.addOptions(options.map(o => ({ label: o.label, value: o.value, emoji: o.emoji, description: o.description })));
	return new ActionRowBuilder().addComponents(menu);
}

function computeEventDate(year, month, day, timeHHmm) {
	const [hh, mm] = timeHHmm.split(':').map(Number);
	if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
		throw new Error('Invalid time format');
	}
	// Create a UTC date
	const utcDate = new Date(Date.UTC(year, month - 1, day, hh, mm, 0));
	// If in the past, roll to next year
	const now = new Date();
	if (utcDate.getTime() <= now.getTime()) {
		utcDate.setUTCFullYear(year + 1);
	}
	return utcDate;
}

// Utilities for signups and public message updates
function createBuildSignupButtons(builds, eventName, eventSignups = null, currentUserId = null) {
	const { ButtonBuilder, ButtonStyle } = require('discord.js');
	const buttons = [];
	(builds || []).forEach((build, index) => {
		const buildName = build.name || build;
		const signupKey = `event_${eventName}_build_${index}`;
		const signups = eventSignups?.get(signupKey) || [];
		const isTaken = signups.length > 0;
		const isTakenByCurrentUser = isTaken && currentUserId && signups.includes(currentUserId);
		const button = new ButtonBuilder()
			.setCustomId(`event_signup_${eventName}_${index}`)
			.setLabel(isTaken ? `${buildName} - Taken` : `Sign up for ${buildName}`)
			.setStyle(isTaken ? (isTakenByCurrentUser ? ButtonStyle.Danger : ButtonStyle.Secondary) : ButtonStyle.Primary)
			.setEmoji(isTaken ? (isTakenByCurrentUser ? '❌' : '🔒') : '✅')
			.setDisabled(false);
		buttons.push(button);
	});
	const rows = [];
	for (let i = 0; i < buttons.length; i += 3) {
		rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
	}
	return rows;
}

async function updatePublicEventMessage(interaction, event, composition) {
	const publicEventEmbed = new EmbedBuilder()
		.setColor('#5865F2')
		.setTitle(`📅 **${event.name}**`)
		.setDescription(`Time (your local): ${event.formattedDateTime}\n${event.relativeTime}`)
		.addFields(
			{ name: '🎯 Content Type', value: event.contentType || 'General', inline: true },
			{ name: '👤 Organizer', value: `<@${event.createdBy}>`, inline: true }
		)
		.setFooter({ text: 'Phoenix Assistance Bot • Event Created' })
		.setTimestamp();

	if (composition && composition.builds && composition.builds.length > 0) {
		const buildList = composition.builds.map((build, index) => {
			const buildName = build.name || build;
			const signupKey = `event_${event.name}_build_${index}`;
			const signups = interaction.client.eventSignups?.get(signupKey) || [];
			if (signups.length === 0) return `${index + 1}. **${buildName}** - *No signups*`;
			const userMentions = signups.map(id => `<@${id}>`).join(', ');
			return `${index + 1}. **${buildName}** - ${userMentions}`;
		}).join('\n');

		publicEventEmbed.addFields({ name: '🎭 **Comp Sheet**', value: `${event.compName}\n\n**Builds:**\n${buildList}`, inline: false });
	}

	const rows = composition ? createBuildSignupButtons(composition.builds || [], event.name, interaction.client.eventSignups, interaction.user.id) : [];

	const channel = interaction.channel;
	const messages = await channel.messages.fetch({ limit: 50 });
	const eventMessage = messages.find(msg => msg.embeds.length > 0 && msg.embeds[0].title === `📅 **${event.name}**` && msg.author.id === interaction.client.user.id);
	if (eventMessage) {
		await eventMessage.edit({ embeds: [publicEventEmbed], components: rows });
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('event')
		.setDescription('Event management')
		.addSubcommand(sub =>
			sub
				.setName('create')
				.setDescription('Create an event interactively')
				.addStringOption(o =>
					o.setName('name')
						.setDescription('Name of the event')
						.setRequired(true)
				)
		),

	async execute(interaction, db) {
		if (!interaction.isChatInputCommand()) return;
		const sub = interaction.options.getSubcommand();
		if (sub !== 'create') return;

		try {
			// Ensure guild is registered
			if (!(await db.isGuildRegistered(interaction.guildId))) {
				const embed = new EmbedBuilder()
					.setColor('#FF0000')
					.setTitle('❌ Guild Not Registered')
					.setDescription('This guild must be registered first. Use `/guild-register`.')
					.setTimestamp();
				return interaction.reply({ embeds: [embed], ephemeral: true });
			}

			const eventName = interaction.options.getString('name');
			createWizardState.set(interaction.user.id, { name: eventName });

			const embed = new EmbedBuilder()
				.setColor('#2b2d31')
				.setTitle('📅 Create Event')
				.setDescription(`Event: **${eventName}**\nStep 1: Select month`)
				.setTimestamp();

			return interaction.reply({ embeds: [embed], components: [buildMonthSelect()], ephemeral: true });
		} catch (err) {
			console.error('Error starting event create wizard:', err);
			return interaction.reply({ content: 'Failed to start event creation.', ephemeral: true });
		}
	},

	async handleSelectMenuInteraction(interaction, db) {
		try {
			const customId = interaction.customId;
			const state = createWizardState.get(interaction.user.id) || {};
			if (customId === 'event_create_month') {
				const month = parseInt(interaction.values[0], 10);
				state.month = month;
				createWizardState.set(interaction.user.id, state);

				const year = new Date().getUTCFullYear();
				const embed = new EmbedBuilder()
					.setColor('#2b2d31')
					.setTitle('📅 Create Event')
					.setDescription(`Event: **${state.name}**\nStep 2: Select day`)
					.setTimestamp();

				return interaction.update({ embeds: [embed], components: [buildDaySelect(year, month)] });
			}

			if (customId === 'event_create_day') {
				const day = parseInt(interaction.values[0], 10);
				state.day = day;
				createWizardState.set(interaction.user.id, state);

				// Show time modal in UTC
				const modal = buildTimeModal();
				return interaction.showModal(modal);
			}
		} catch (err) {
			console.error('Error in event select menu handler:', err);
			if (!interaction.replied && !interaction.deferred) {
				return interaction.reply({ content: 'Something went wrong handling your selection.', ephemeral: true });
			}
		}
	},

	async handleModalSubmit(interaction, db) {
		try {
			if (interaction.customId !== 'event_modal_time') return;
			const state = createWizardState.get(interaction.user.id);
			if (!state || !state.name || !state.month || !state.day) {
				return interaction.reply({ content: 'Session expired. Please run /event create again.', ephemeral: true });
			}

			const timeStr = interaction.fields.getTextInputValue('event_time_input').trim();
			const year = new Date().getUTCFullYear();
			let eventDate;
			try {
				eventDate = computeEventDate(year, state.month, state.day, timeStr);
			} catch (e) {
				return interaction.reply({ content: 'Invalid time. Use HH:MM (24h).', ephemeral: true });
			}

			const ts = toUnixSeconds(eventDate);
			const formattedDateTime = `<t:${ts}:F>`; // Full date-time in viewer's local time
			const relativeTime = `<t:${ts}:R>`; // Relative (in X time)

			// Save time in state and continue to content type selection
			state.timestamp = ts;
			state.formattedDateTime = formattedDateTime;
			state.relativeTime = relativeTime;
			state.dateTimeIso = eventDate.toISOString();
			createWizardState.set(interaction.user.id, state);

			const embed = new EmbedBuilder()
				.setColor('#2b2d31')
				.setTitle('📅 Create Event')
				.setDescription(`Event: **${state.name}**\nWhen: ${formattedDateTime} (${relativeTime})\nStep 3: Select optional content type`)
				.setTimestamp();

			const contentTypes = await db.getContentTypes(interaction.guildId);
			return interaction.reply({ embeds: [embed], components: [buildContentTypeSelect(contentTypes)], ephemeral: true });
		} catch (err) {
			console.error('Error handling event time modal:', err);
			if (!interaction.replied && !interaction.deferred) {
				return interaction.reply({ content: 'Failed to create event.', ephemeral: true });
			}
		}
	},

	async handleContentTypeSelection(interaction, db) {
		try {
			const state = createWizardState.get(interaction.user.id);
			if (!state) {
				return interaction.reply({ content: 'Session expired. Please run /event create again.', ephemeral: true });
			}
			const selected = interaction.values[0];
			state.contentType = selected === 'none' ? '' : selected;
			createWizardState.set(interaction.user.id, state);

			// Fetch compositions based on content type
			let comps = [];
			if (state.contentType && state.contentType !== '') {
				comps = await db.getComps(interaction.guildId, state.contentType);
			} else {
				comps = await db.getComps(interaction.guildId, null);
			}

			const embed = new EmbedBuilder()
				.setColor('#2b2d31')
				.setTitle('📅 Create Event')
				.setDescription(`Event: **${state.name}**\nWhen: ${state.formattedDateTime} (${state.relativeTime})\nContent Type: ${state.contentType || 'None'}\nStep 4: Select optional Comp Sheet, then Create Event`)
				.setTimestamp();

			const compRow = buildCompSelect(comps);
			// Create button row
			const buttons = new ActionRowBuilder().addComponents(
				new (require('discord.js').ButtonBuilder)()
					.setCustomId('event_create')
					.setLabel('✅ Create Event')
					.setStyle(require('discord.js').ButtonStyle.Success)
			);

			return interaction.update({ embeds: [embed], components: [compRow, buttons] });
		} catch (err) {
			console.error('Error handling content type selection:', err);
			return interaction.reply({ content: 'Failed to process content type.', ephemeral: true });
		}
	},

	async handleCompSelection(interaction, db) {
		try {
			const state = createWizardState.get(interaction.user.id);
			if (!state) {
				return interaction.reply({ content: 'Session expired. Please run /event create again.', ephemeral: true });
			}
			const selected = interaction.values[0];
			state.compName = selected === 'none' ? '' : selected;
			createWizardState.set(interaction.user.id, state);

			const embed = new EmbedBuilder()
				.setColor('#2b2d31')
				.setTitle('📅 Create Event')
				.setDescription(`Event: **${state.name}**\nWhen: ${state.formattedDateTime} (${state.relativeTime})\nContent Type: ${state.contentType || 'None'}\nComp Sheet: ${state.compName || 'None'}\nPress Create Event to finish.`)
				.setTimestamp();

			// Keep existing components, just update embed
			return interaction.update({ embeds: [embed] });
		} catch (err) {
			console.error('Error handling comp selection:', err);
			return interaction.reply({ content: 'Failed to process comp selection.', ephemeral: true });
		}
	},

	async handleButtonInteraction(interaction, db) {
		try {
			if (interaction.customId !== 'event_create') return;
			const state = createWizardState.get(interaction.user.id);
			if (!state || !state.timestamp) {
				return interaction.reply({ content: 'Session expired. Please run /event create again.', ephemeral: true });
			}

			await db.addEvent(interaction.guildId, {
				name: state.name,
				dateTime: state.dateTimeIso,
				timestamp: state.timestamp,
				formattedDateTime: state.formattedDateTime,
				relativeTime: state.relativeTime,
				contentType: state.contentType || '',
				compName: state.compName || '',
				createdBy: interaction.user.id,
				createdAt: new Date()
			});

			// Prepare embed and optionally buttons
			const publicEmbed = new EmbedBuilder()
				.setColor('#5865F2')
				.setTitle(`📅 **${state.name}**`)
				.setDescription(`Time (your local): ${state.formattedDateTime}\n${state.relativeTime}`)
				.addFields(
					{ name: '🎯 Content Type', value: state.contentType || 'None', inline: true },
					{ name: '🎭 Comp Sheet', value: state.compName || 'None', inline: true }
				)
				.setFooter({ text: 'Phoenix Assistance Bot • Event Created' })
				.setTimestamp();

			// Load signups map into memory
			if (!interaction.client.eventSignups) {
				interaction.client.eventSignups = new Map();
			}

			let components = [];
			let selectedComp = null;
			if (state.compName && state.compName !== '') {
				try {
					if (state.contentType && state.contentType !== '') {
						const contentTypeComps = await db.getComps(interaction.guildId, state.contentType);
						selectedComp = contentTypeComps.find(c => c.name === state.compName) || null;
					}
					if (!selectedComp) {
						const generalComps = await db.getComps(interaction.guildId, null);
						selectedComp = generalComps.find(c => c.name === state.compName) || null;
					}
					if (selectedComp && selectedComp.builds && selectedComp.builds.length > 0) {
						components = createBuildSignupButtons(selectedComp.builds, state.name, interaction.client.eventSignups, interaction.user.id);
						publicEmbed.addFields({ name: '🎭 **Comp Sheet**', value: state.compName, inline: true });
					}
				} catch (_) {}
			}

			createWizardState.delete(interaction.user.id);

			await interaction.update({ content: '✅ Event created!', embeds: [], components: [] });
			await interaction.channel.send({ embeds: [publicEmbed], components });
		} catch (err) {
			console.error('Error finalizing event:', err);
			if (!interaction.replied && !interaction.deferred) {
				return interaction.reply({ content: 'Failed to create event.', ephemeral: true });
			}
		}
	},

	async handleBuildSignup(interaction, db) {
		try {
			const customId = interaction.customId;
			const match = customId.match(/^event_signup_(.+)_(\d+)$/);
			if (!match) {
				return interaction.reply({ content: 'Invalid signup action.', ephemeral: true });
			}
			const eventName = match[1];
			const buildIndex = parseInt(match[2], 10);
			const userId = interaction.user.id;

			// Load event and comp
			const events = await db.getEvents(interaction.guildId);
			const event = events.find(e => e.name === eventName);
			if (!event) {
				return interaction.reply({ content: '❌ Event not found.', ephemeral: true });
			}

			let composition = null;
			if (event.compName) {
				if (event.contentType) {
					const contentTypeComps = await db.getComps(interaction.guildId, event.contentType);
					composition = contentTypeComps.find(c => c.name === event.compName) || null;
				}
				if (!composition) {
					const generalComps = await db.getComps(interaction.guildId, null);
					composition = generalComps.find(c => c.name === event.compName) || null;
				}
			}
			if (!composition || !composition.builds || !composition.builds[buildIndex]) {
				return interaction.reply({ content: '❌ Build not found.', ephemeral: true });
			}

			// Ensure memory map
			if (!interaction.client.eventSignups) {
				interaction.client.eventSignups = new Map();
			}

			const signupKey = `event_${eventName}_build_${buildIndex}`;
			const currentSignups = interaction.client.eventSignups.get(signupKey) || [];

			if (currentSignups.includes(userId)) {
				// Remove self
				interaction.client.eventSignups.set(signupKey, currentSignups.filter(id => id !== userId));
				await db.removeEventSignup(interaction.guildId, eventName, buildIndex, userId);
				await interaction.deferUpdate();
			} else {
				// If taken by someone else
				if (currentSignups.length > 0) {
					return interaction.reply({ content: '❌ This build is already taken.', ephemeral: true });
				}
				// Check if user already signed up for another build in this event
				let userAlreadySigned = false;
				for (let i = 0; i < composition.builds.length; i++) {
					const otherKey = `event_${eventName}_build_${i}`;
					const other = interaction.client.eventSignups.get(otherKey) || [];
					if (other.includes(userId)) { userAlreadySigned = true; break; }
				}
				if (userAlreadySigned) {
					return interaction.reply({ content: '❌ You are already signed up for another build in this event.', ephemeral: true });
				}
				// Add signup
				interaction.client.eventSignups.set(signupKey, [userId]);
				await db.addEventSignup(interaction.guildId, eventName, buildIndex, userId);
				await interaction.deferUpdate();
			}

			// Refresh public message
			await updatePublicEventMessage(interaction, event, composition);
		} catch (err) {
			console.error('Error handling build signup:', err);
			return interaction.reply({ content: 'An error occurred processing signup.', ephemeral: true });
		}
	},

	async handleCancelSelection(interaction, db) {
		return;
	},
};


