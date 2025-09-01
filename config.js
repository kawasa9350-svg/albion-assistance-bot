require('dotenv').config();

const config = {
  bot: {
    token: process.env.BOT_TOKEN || "",
    applicationId: process.env.APPLICATION_ID || "",
    prefix: "!",
    intents: ["Guilds", "GuildMessages"]
  },
  database: {
    uri: process.env.MONGODB_URI || "",
    databaseName: process.env.DATABASE_NAME || "albion_assistance"
  },
  development: {
    guildId: process.env.GUILD_ID || "",
    useGuildCommands: true
  },
  embeds: {
    colors: {
      success: "#00FF00",
      error: "#FF0000",
      info: "#0099FF",
      warning: "#FFAA00"
    },
    footer: "Phoenix Assistance Bot"
  },
  permissions: {
    defaultAdminCommands: ["register", "perms-add", "perms-remove"],
    defaultContentCommands: ["add-content", "build", "content-list"]
  },
  features: {
    enableDMs: false
  },
  registration: {
    prefixRequiredRoles: ["1233618625034850377"],
    skipPrefixForRoles: [""]
  }
};

module.exports = config;
