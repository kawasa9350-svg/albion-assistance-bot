const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const MONTHS = [
	{ label: 'January', value: '0', days: 31 },
	{ label: 'February', value: '1', days: 29 },
	{ label: 'March', value: '2', days: 31 },
	{ label: 'April', value: '3', days: 30 },
	{ label: 'May', value: '4', days: 31 },
	{ label: 'June', value: '5', days: 30 },
	{ label: 'July', value: '6', days: 31 },
	{ label: 'August', value: '7', days: 31 },
	{ label: 'September', value: '8', days: 30 },
	{ label: 'October', value: '9', days: 31 },
	{ label: 'November', value: '10', days: 30 },
	{ label: 'December', value: '11', days: 31 }
];

function buildMonthSelectRow(selectedMonth) {
	const menu = new StringSelectMenuBuilder()
		.setCustomId('event_month_select')
		.setPlaceholder('Select month')
		.addOptions(
			MONTHS.map((m) => new StringSelectMenuOptionBuilder().setLabel(m.label).setValue(m.value).setDefault(selectedMonth === m.value))
		);
	return new ActionRowBuilder().addComponents(menu);
}

function buildDaySelectRow(monthIndex, selectedDay) {
	const month = MONTHS[Number(monthIndex)];
	const totalDays = month.days;
	const options = [];
	for (let d = 1; d <= totalDays; d++) {
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(String(d))
				.setValue(String(d))
				.setDefault(String(d) === String(selectedDay))
		);
	}
	const menu = new StringSelectMenuBuilder()
		.setCustomId('event_day_select')
		.setPlaceholder('Select day')
		.addOptions(options);
	return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('event')
		.setDescription('Manage events')
		.addSubcommand(sub =>
			sub
				.setName('create')
				.setDescription('Create a new event interactively')
				.addStringOption(opt => opt.setName('name').setDescription('Name of the event').setRequired(true))
		),

	async execute(interaction, db) {
		const sub = interaction.options.getSubcommand();
		if (sub !== 'create') {
			await interaction.reply({ content: 'Unsupported subcommand.', ephemeral: true });
			return;
		}

		const name = interaction.options.getString('name', true);

		interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
		interaction.client.eventDrafts.set(interaction.user.id, {
			name,
			month: null,
			day: null
		});

		const embed = new EmbedBuilder()
			.setColor('#2ECC71')
			.setTitle('📅 Create Event')
			.setDescription(`Name: **${name}**\n\nSelect the month for your event.`)
			.setFooter({ text: 'Step 1 of 3 • Month' })
			.setTimestamp();

		await interaction.reply({ embeds: [embed], components: [buildMonthSelectRow(null)], ephemeral: true });
	},

	async handleContentTypeSelection() {},

	async handleCompSelection() {},

	async handleCancelSelection() {},

	async handleButtonInteraction() {},

	async handleSelectMenuInteraction(interaction) {
		const userId = interaction.user.id;
		interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
		const draft = interaction.client.eventDrafts.get(userId);
		if (!draft) {
			await interaction.reply({ content: 'No active event creation. Use /event create again.', ephemeral: true });
			return;
		}

		if (interaction.customId === 'event_month_select') {
			const selected = interaction.values[0];
			draft.month = selected;
			const embed = new EmbedBuilder()
				.setColor('#2ECC71')
				.setTitle('📅 Create Event')
				.setDescription(`Name: **${draft.name}**\nMonth: **${MONTHS[Number(selected)].label}**\n\nSelect the day.`)
				.setFooter({ text: 'Step 2 of 3 • Day' })
				.setTimestamp();
			await interaction.update({ embeds: [embed], components: [buildDaySelectRow(selected, null)] });
			return;
		}

		if (interaction.customId === 'event_day_select') {
			const selectedDay = interaction.values[0];
			draft.day = Number(selectedDay);
			// Open time modal (UTC HH:MM)
			const modal = new ModalBuilder()
				.setCustomId('event_modal_time')
				.setTitle('Event Time (UTC)');

			const timeInput = new TextInputBuilder()
				.setCustomId('utc_time')
				.setLabel('Enter time in UTC (HH:MM, 24h)')
				.setPlaceholder('e.g., 19:30')
				.setStyle(TextInputStyle.Short)
				.setRequired(true);

			modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
			await interaction.showModal(modal);
			return;
		}
	},

	async handleModalSubmit(interaction, db) {
		if (interaction.customId !== 'event_modal_time') return;

		const userId = interaction.user.id;
		interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
		const draft = interaction.client.eventDrafts.get(userId);
		if (!draft || draft.month === null || draft.day === null) {
			await interaction.reply({ content: 'Event draft not found. Please run /event create again.', ephemeral: true });
			return;
		}

		const timeStr = interaction.fields.getTextInputValue('utc_time').trim();
		const match = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
		if (!match) {
			await interaction.reply({ content: 'Invalid time format. Use HH:MM in 24h UTC.', ephemeral: true });
			return;
		}
		const hours = Number(match[1]);
		const minutes = Number(match[2]);

		// Build a UTC datetime using current year
		const now = new Date();
		const year = now.getUTCFullYear();
		const monthIndex = Number(draft.month);
		const day = Number(draft.day);
		const dateUtc = new Date(Date.UTC(year, monthIndex, day, hours, minutes, 0));
		const unixSeconds = Math.floor(dateUtc.getTime() / 1000);

		const eventData = {
			name: draft.name,
			dateTime: dateUtc.toISOString(),
			timestamp: unixSeconds,
			formattedDateTime: `<t:${unixSeconds}:F>`,
			relativeTime: `<t:${unixSeconds}:R>`,
			contentType: null,
			compName: null,
			createdBy: userId,
			createdAt: new Date()
		};

		let saved = true;
		if (db && db.addEvent) {
			saved = await db.addEvent(interaction.guildId, eventData);
		}

		// Persist immediately if desired, but user asked to collect content type and comp next.
		// Keep draft and move to content type selection flow (ephemeral).
		draft.timestamp = unixSeconds;
		draft.dateTime = eventData.dateTime;
		draft.formattedDateTime = eventData.formattedDateTime;
		draft.relativeTime = eventData.relativeTime;
		draft.contentType = null;
		draft.compName = null;
		interaction.client.eventDrafts.set(userId, draft);

		await this.showContentTypeSelection(interaction, db, draft);
	}
};

// Additional interactive steps: content type, comp, final confirmation
module.exports.showContentTypeSelection = async function(interaction, db, draft) {
	try {
		const contentTypes = (await db.getContentTypes(interaction.guildId)) || [];
		const select = new StringSelectMenuBuilder()
			.setCustomId('event_content_type_select')
			.setPlaceholder('Select content type (optional)')
			.addOptions([
				new StringSelectMenuOptionBuilder().setLabel('No Content Type').setValue('none').setDescription('General event').setEmoji('📄'),
				new StringSelectMenuOptionBuilder().setLabel('General').setValue('General').setDescription('General purpose').setEmoji('📄'),
				...contentTypes.map(ct => new StringSelectMenuOptionBuilder().setLabel(ct).setValue(ct).setDescription(`Event for ${ct}`).setEmoji('🎯'))
			]);
		const row = new ActionRowBuilder().addComponents(select);
		const embed = new EmbedBuilder()
			.setColor('#2ECC71')
			.setTitle('📅 Create Event')
			.setDescription(`Name: **${draft.name}**\nWhen: ${draft.formattedDateTime} (${draft.relativeTime})\n\nSelect an optional content type.`)
			.setFooter({ text: 'Step 3 of 4 • Content Type' })
			.setTimestamp();

		if (interaction.replied || interaction.deferred) {
			await interaction.editReply({ embeds: [embed], components: [row] });
		} else {
			await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
		}
	} catch (e) {
		console.error('Error showing content type selection:', e);
		if (interaction.replied || interaction.deferred) {
			await interaction.editReply({ content: 'Failed to load content types.', components: [] });
		} else {
			await interaction.reply({ content: 'Failed to load content types.', ephemeral: true });
		}
	}
};

module.exports.handleContentTypeSelection = async function(interaction, db) {
	const userId = interaction.user.id;
	interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
	const draft = interaction.client.eventDrafts.get(userId);
	if (!draft) {
		await interaction.reply({ content: 'No active event creation. Use /event create again.', ephemeral: true });
		return;
	}
	const selected = interaction.values[0];
	draft.contentType = selected === 'none' ? '' : selected;
	interaction.client.eventDrafts.set(userId, draft);
	await module.exports.showCompSelection(interaction, db, draft);
};

module.exports.showCompSelection = async function(interaction, db, draft) {
	try {
		let comps;
		if (draft.contentType && draft.contentType !== '') {
			comps = await db.getComps(interaction.guildId, draft.contentType);
		} else {
			comps = await db.getComps(interaction.guildId, null);
		}
		comps = comps || [];
		if (comps.length === 0) {
			await module.exports.showFinalStep(interaction, draft);
			return;
		}
		const select = new StringSelectMenuBuilder()
			.setCustomId('event_comp_select')
			.setPlaceholder('Select Comp Sheet (optional)')
			.addOptions([
				new StringSelectMenuOptionBuilder().setLabel('No Comp Sheet').setValue('none').setDescription('No comp').setEmoji('📄'),
				...comps.map(c => new StringSelectMenuOptionBuilder().setLabel(c.name || 'Unnamed').setValue(c.name || 'Unnamed').setDescription(`${(c.builds?.length)||0} builds`).setEmoji('🎭'))
			]);
		const row = new ActionRowBuilder().addComponents(select);
		const embed = new EmbedBuilder()
			.setColor('#2ECC71')
			.setTitle('📅 Create Event')
			.setDescription(`Name: **${draft.name}**\nWhen: ${draft.formattedDateTime} (${draft.relativeTime})\nContent Type: ${draft.contentType || 'None'}\n\nSelect an optional Comp.`)
			.setFooter({ text: 'Step 4 of 4 • Comp' })
			.setTimestamp();
		await interaction.update({ embeds: [embed], components: [row] });
	} catch (e) {
		console.error('Error showing comp selection:', e);
		await interaction.reply({ content: 'Failed to load comps.', ephemeral: true });
	}
};

module.exports.handleCompSelection = async function(interaction, db) {
	const userId = interaction.user.id;
	interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
	const draft = interaction.client.eventDrafts.get(userId);
	if (!draft) {
		await interaction.reply({ content: 'No active event creation. Use /event create again.', ephemeral: true });
		return;
	}
	const selected = interaction.values[0];
	draft.compName = selected === 'none' ? '' : selected;
	interaction.client.eventDrafts.set(userId, draft);
	await module.exports.showFinalStep(interaction, draft);
};

module.exports.showFinalStep = async function(interaction, draft) {
	const embed = new EmbedBuilder()
		.setColor('#2ECC71')
		.setTitle('📅 Confirm Event')
		.setDescription('Review details and create the event.')
		.addFields(
			{ name: 'Name', value: draft.name, inline: true },
			{ name: 'When', value: `${draft.formattedDateTime} (${draft.relativeTime})`, inline: true },
			{ name: 'Content Type', value: draft.contentType || 'None', inline: true },
			{ name: 'Comp', value: draft.compName || 'None', inline: true }
		)
		.setTimestamp();
	const buttons = new ActionRowBuilder().addComponents(
		new (require('discord.js').ButtonBuilder)().setCustomId('event_create').setLabel('Create Event').setStyle(require('discord.js').ButtonStyle.Success),
		new (require('discord.js').ButtonBuilder)().setCustomId('event_cancel').setLabel('Cancel').setStyle(require('discord.js').ButtonStyle.Danger)
	);
	await interaction.update({ embeds: [embed], components: [buttons] });
};

module.exports.handleButtonInteraction = async function(interaction, db) {
	const userId = interaction.user.id;
	interaction.client.eventDrafts = interaction.client.eventDrafts || new Map();
	const draft = interaction.client.eventDrafts.get(userId);
	if (interaction.customId === 'event_cancel') {
		interaction.client.eventDrafts.delete(userId);
		await interaction.update({ content: '❌ Event creation cancelled.', embeds: [], components: [] });
		return;
	}
	if (interaction.customId === 'event_create') {
		if (!draft || !draft.timestamp) {
			await interaction.reply({ content: 'Draft incomplete. Please run /event create again.', ephemeral: true });
			return;
		}
		const eventData = {
			name: draft.name,
			dateTime: new Date(draft.timestamp * 1000).toISOString(),
			timestamp: draft.timestamp,
			formattedDateTime: draft.formattedDateTime,
			relativeTime: draft.relativeTime,
			contentType: draft.contentType || '',
			compName: draft.compName || '',
			createdBy: userId,
			createdAt: new Date()
		};
		let saved = true;
		if (db && db.addEvent) {
			saved = await db.addEvent(interaction.guildId, eventData);
		}
		if (!saved) {
			await interaction.update({ content: '❌ Failed to save event.', embeds: [], components: [] });
			return;
		}
		interaction.client.eventDrafts.delete(userId);
		await interaction.update({ content: `✅ Event **${eventData.name}** created!`, embeds: [], components: [] });
		const publicEmbed = new EmbedBuilder()
			.setColor('#2ECC71')
			.setTitle(`📅 **${eventData.name}**`)
			.setDescription(`When: ${eventData.formattedDateTime} (${eventData.relativeTime})`)
			.addFields(
				{ name: 'Content Type', value: eventData.contentType || 'None', inline: true },
				{ name: 'Organizer', value: `<@${eventData.createdBy}>`, inline: true }
			)
			.setTimestamp();
		await interaction.channel.send({ embeds: [publicEmbed] });
	}
};


