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
  integrations: {
    // Shared secret for accepting webhook payloads from the Alliance bot
    allianceWebhookSecret: process.env.ALLIANCE_WEBHOOK_SECRET || "",
    // Optional override for caller fee if the inbound payload omits it
    defaultCallerFeeRate: parseFloat(process.env.CALLER_FEE_RATE || "0.05"),
    // Channel ID for alliance lootsplit confirmations (optional)
    allianceNotificationChannelId: process.env.ALLIANCE_NOTIFICATION_CHANNEL_ID || ""
  },
  registration: {
    prefixRequiredRoles: ["1233618625034850377"],
    skipPrefixForRoles: [""]
  }
};

module.exports = config;
