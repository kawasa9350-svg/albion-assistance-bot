const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = require('./config.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load command data
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`📝 Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Command at ${filePath} is missing required properties`);
    }
}

// Create REST instance
const rest = new REST({ version: '10' }).setToken(config.bot.token);

// Deploy commands
(async () => {
    try {
        console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

        let data;
        
        // Check if we should use guild-specific commands for development
        if (config.development && config.development.useGuildCommands && config.development.guildId && config.development.guildId !== "YOUR_TEST_GUILD_ID_HERE") {
            console.log(`🎯 Deploying commands to guild: ${config.development.guildId}`);
            console.log(`⚡ Commands will be available INSTANTLY in this guild!`);
            
            // Deploy commands to specific guild (instant updates)
            data = await rest.put(
                Routes.applicationGuildCommands(config.bot.applicationId, config.development.guildId),
                { body: commands },
            );
        } else {
            console.log(`🌍 Deploying commands globally (may take up to 1 hour to update)`);
            
            // Deploy commands globally
            data = await rest.put(
                Routes.applicationCommands(config.bot.applicationId),
                { body: commands },
            );
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        
        // List deployed commands
        console.log('\n📋 Deployed Commands:');
        data.forEach(command => {
            console.log(`  - /${command.name}: ${command.description}`);
        });
        
        if (config.development && config.development.useGuildCommands && config.development.guildId && config.development.guildId !== "YOUR_TEST_GUILD_ID_HERE") {
            console.log('\n🎯 Commands deployed to your test guild!');
            console.log('⚡ They are available INSTANTLY - no waiting required!');
        } else {
            console.log('\n🌍 Commands deployed globally');
            console.log('⏰ May take up to 1 hour to appear in all servers');
        }
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
