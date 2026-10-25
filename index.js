
"use strict";

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType,
  Events
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("./config");
const commands = require("./commands");

const config = loadConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// -----------------------------------------------
// SETTINGS STORAGE
// -----------------------------------------------

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "settings.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSettings() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {};
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {};
    }

    return data;
  } catch (error) {
    console.error("[SETTINGS] Failed to load settings:", error);
    return {};
  }
}

let settings = loadSettings();

function saveSettings() {
  const temporaryFile = `${DATA_FILE}.tmp`;

  try {
    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(settings, null, 2),
      "utf8"
    );

    fs.renameSync(temporaryFile, DATA_FILE);
  } catch (error) {
    console.error("[SETTINGS] Failed to save settings:", error);

    try {
      if (fs.existsSync(temporaryFile)) {
        fs.unlinkSync(temporaryFile);
      }
    } catch (cleanupError) {
      console.error("[SETTINGS] Temporary-file cleanup failed.");
    }

    throw error;
  }
}

// -----------------------------------------------
// EMBEDS
// -----------------------------------------------

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.embedColor ?? 0x111111)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "PYRR | Server Protection"
    })
    .setTimestamp();
}

// -----------------------------------------------
// BOT PRESENCE
// -----------------------------------------------

let previousActivity = -1;
let presenceTimer = null;

function getServerCount() {
  return client.guilds.cache.size;
}

function getUserCount() {
  return client.guilds.cache.reduce(
    (total, guild) => total + (guild.memberCount || 0),
    0
  );
}

function updatePyrrPresence() {
  if (!client.user) {
    return;
  }

  const serverCount = getServerCount();
  const userCount = getUserCount();

  const activities = [
    `Protecting ${serverCount} Servers`,
    `Protecting ${userCount} Users`,
    `${serverCount} Servers | ${userCount} Users`,
    `One Piece | ${serverCount} Servers`,
    `Protecting ${serverCount} Servers`,
    `Protecting ${userCount} Users`
  ];

  let nextActivity = Math.floor(
    Math.random() * activities.length
  );

  // Avoid repeating the last activity.
  if (
    activities.length > 1 &&
    nextActivity === previousActivity
  ) {
    nextActivity = (nextActivity + 1) % activities.length;
  }

  previousActivity = nextActivity;

  const activityName = activities[nextActivity];

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: activityName,
        type: ActivityType.Playing
      }
    ]
  });

  console.log(`[PRESENCE] Playing ${activityName}`);
}

// -----------------------------------------------
// SLASH COMMAND REGISTRATION
// -----------------------------------------------

async function registerCommands() {
  const rest = new REST({ version: "10" })
    .setToken(config.token);

  const commandData = commands.map(command =>
    command.toJSON()
  );

  await rest.put(
    Routes.applicationCommands(config.clientId),
    {
      body: commandData
    }
  );

  console.log(
    `[COMMANDS] Registered ${commandData.length} slash commands.`
  );
}

// -----------------------------------------------
// BOT READY
// -----------------------------------------------

client.once(Events.ClientReady, async readyClient => {
  console.log("----------------------------------------");
  console.log(`PYRR online as ${readyClient.user.tag}`);
  console.log(`Servers: ${getServerCount()}`);
  console.log(`Users: ${getUserCount()}`);
  console.log("----------------------------------------");

  updatePyrrPresence();

  if (presenceTimer) {
    clearInterval(presenceTimer);
  }

  presenceTimer = setInterval(() => {
    updatePyrrPresence();
  }, 60_000);

  try {
    await registerCommands();
  } catch (error) {
    console.error(
      "[COMMANDS] Registration failed:",
      error
    );
  }
});

// -----------------------------------------------
// SLASH COMMAND HANDLER
// -----------------------------------------------

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    // /ping
    if (interaction.commandName === "ping") {
      const latency = client.ws.ping;

      const embed = makeEmbed(
        "Pong!",
        [
          `**WebSocket latency:** ${latency} ms`,
          "**Status:** Operational"
        ].join("\n")
      );

      return await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // /join_logs
    if (interaction.commandName === "join_logs") {
      // Only the configured bot owner can use this command.
      if (interaction.user.id !== config.ownerId) {
        return await interaction.reply({
          embeds: [
            makeEmbed(
              "Access Denied",
              "This command is restricted to the bot owner."
            )
          ],
          ephemeral: true
        });
      }

      if (!interaction.inGuild()) {
        return await interaction.reply({
          content: "This command can only be used in a server.",
          ephemeral: true
        });
      }

      const channel = interaction.options.getChannel(
        "channel",
        true
      );

      if (
        !channel.isTextBased() ||
        channel.guildId !== interaction.guildId
      ) {
        return await interaction.reply({
          content: "Please select a text channel in this server.",
          ephemeral: true
        });
      }

      const botMember = interaction.guild.members.me;

      if (!botMember) {
        return await interaction.reply({
          content: "I could not verify my server permissions.",
          ephemeral: true
        });
      }

      const permissions = channel.permissionsFor(botMember);

      const requiredPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
      ];

      if (
        !permissions ||
        !permissions.has(requiredPermissions)
      ) {
        return await interaction.reply({
          content:
            "I need View Channel, Send Messages, and Embed Links permissions in that channel.",
          ephemeral: true
        });
      }

      const previousChannelId = settings.joinLogChannelId;

      settings.joinLogChannelId = channel.id;

      try {
        saveSettings();
      } catch (error) {
        settings.joinLogChannelId = previousChannelId;

        return await interaction.reply({
          content:
            "I could not save the settings. Check the host's file permissions and persistent storage.",
          ephemeral: true
        });
      }

      const embed = makeEmbed(
        "Join Logs Configured",
        [
          `**Log channel:** ${channel}`,
          "",
          "PYRR will send a notification to this channel whenever it joins another server.",
          "",
          "Only the configured bot owner can change this setting."
        ].join("\n")
      );

      return await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // A command exists in Discord but is not handled here.
    return await interaction.reply({
      content: "This command is not implemented yet.",
      ephemeral: true
    });
  } catch (error) {
    console.error(
      `[COMMAND ERROR] ${interaction.commandName}:`,
      error
    );

    const response = {
      content:
        "An unexpected error occurred while running this command.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// -----------------------------------------------
// SERVER JOIN LOGS
// -----------------------------------------------

client.on(Events.GuildCreate, async guild => {
  console.log(
    `[GUILD JOIN] ${guild.name} (${guild.id})`
  );

  // Refresh status when the bot joins a server.
  updatePyrrPresence();

  const channelId = settings.joinLogChannelId;

  if (!channelId) {
    console.warn("[JOIN LOGS] No log channel configured.");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);

    if (
      !channel ||
      !channel.isTextBased() ||
      !channel.guild
    ) {
      console.error(
        "[JOIN LOGS] The configured channel is unavailable."
      );
      return;
    }

    let ownerText = "Unavailable";

    try {
      const owner = await guild.fetchOwner();

      ownerText = `${owner.user.tag} (${owner.id})`;
    } catch (error) {
      console.error(
        "[JOIN LOGS] Could not fetch server owner:",
        error
      );
    }

    const embed = makeEmbed(
      "PYRR Joined a Server",
      [
        `**Server:** ${guild.name}`,
        `**Server ID:** ${guild.id}`,
        `**Server Owner:** ${ownerText}`,
        `**Member Count:** ${guild.memberCount ?? "Unknown"}`,
        "",
        "PYRR has successfully joined this server.",
        "",
        "**Original Invite:** Unavailable"
      ].join("\n")
    );

    await channel.send({
      embeds: [embed]
    });

    console.log(
      `[JOIN LOGS] Notification sent for ${guild.name}.`
    );
  } catch (error) {
    console.error(
      "[JOIN LOGS] Failed to send notification:",
      error
    );
  }
});

// -----------------------------------------------
// SERVER LEAVE
// -----------------------------------------------

client.on(Events.GuildDelete, guild => {
  console.log(
    `[GUILD LEAVE] ${guild.name} (${guild.id})`
  );

  updatePyrrPresence();
});

// -----------------------------------------------
// ERROR HANDLING
// -----------------------------------------------

client.on(Events.Error, error => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

client.on(Events.Warn, warning => {
  console.warn("[DISCORD WARNING]", warning);
});

process.on("unhandledRejection", error => {
  console.error("[UNHANDLED REJECTION]", error);
});

process.on("uncaughtException", error => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});

// -----------------------------------------------
// START BOT
// -----------------------------------------------

client.login(config.token).catch(error => {
  console.error("[LOGIN ERROR] Could not log in to Discord:", error);
  process.exitCode = 1;
});
              
