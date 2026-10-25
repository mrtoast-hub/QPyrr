"use strict";

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActivityType
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("./config");

const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.GuildMember]
});

const DATA_DIR = path.join(__dirname, "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { joinLogChannelId: null };
    }

    const data = JSON.parse(
      fs.readFileSync(SETTINGS_FILE, "utf8")
    );

    return {
      joinLogChannelId: data.joinLogChannelId || null
    };
  } catch (error) {
    console.error("[SETTINGS] Failed to load settings:", error);
    return { joinLogChannelId: null };
  }
}

let settings = loadSettings();

function saveSettings() {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(settings, null, 2),
    "utf8"
  );
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PYRR | Server Management" })
    .setTimestamp();
}

function isOwner(userId) {
  return userId === config.ownerId;
}

async function sendJoinLog(embed) {
  if (!settings.joinLogChannelId) {
    console.warn("[JOIN LOG] No log channel configured.");
    return false;
  }

  try {
    const channel = await client.channels.fetch(
      settings.joinLogChannelId
    );

    if (!channel || !channel.isTextBased() || !channel.send) {
      console.error("[JOIN LOG] Saved channel is unavailable.");
      return false;
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error("[JOIN LOG] Could not send log:", error.message);
    return false;
  }
}

/*
 * This creates a NEW invite for logging purposes.
 * It is not necessarily the original invite used to add PYRR.
 */
async function createFallbackInvite(guild) {
  try {
    const channels = await guild.channels.fetch();

    const candidates = channels.filter(channel =>
      channel &&
      channel.type === ChannelType.GuildText &&
      channel.permissionsFor(guild.members.me)?.has(
        PermissionFlagsBits.CreateInstantInvite
      )
    );

    for (const channel of candidates.values()) {
      try {
        const invite = await channel.createInvite({
          maxAge: 7 * 24 * 60 * 60,
          maxUses: 0,
          unique: true,
          reason: "PYRR server join log"
        });

        return invite.url;
      } catch (error) {
        console.warn(
          `[INVITE] Could not create invite in #${channel.name}:`,
          error.message
        );
      }
    }

    return null;
  } catch (error) {
    console.error("[INVITE] Could not inspect server channels:", error);
    return null;
  }
}const slashCommands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check PYRR's response time."),

  new SlashCommandBuilder()
    .setName("join_logs")
    .setDescription("Set the channel for PYRR server join logs.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel where join logs should be sent.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);

  await rest.put(
    Routes.applicationCommands(config.clientId),
    { body: slashCommands }
  );

  console.log("[COMMANDS] Slash commands registered.");
}

function updatePyrrPresence() {
  if (!client.user) return;

  const serverCount = client.guilds.cache.size;

  const userCount = client.guilds.cache.reduce(
    (total, guild) => total + (guild.memberCount || 0),
    0
  );

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: `One Piece | ${serverCount} servers`,
        type: ActivityType.Watching
      }
    ]
  });

  console.log(
    `[PRESENCE] Watching One Piece | ${serverCount} servers | ${userCount} users`
  );
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "ping") {
      const embed = makeEmbed(
        "PYRR | Pong",
        `Latency: **${client.ws.ping}ms**`
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "join_logs") {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({
          content: "This command is restricted to the bot owner.",
          ephemeral: true
        });
        return;
      }

      const channel = interaction.options.getChannel("channel", true);

      settings.joinLogChannelId = channel.id;
      saveSettings();

      const embed = makeEmbed(
        "Join Logs Configured",
        `Server join notifications will be sent to ${channel}.\n\n` +
        "**Note:** This is the global PYRR join-log destination. `settings.json` stores the channel ID.`
      );

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      console.log(
        `[JOIN LOG] Destination set to #${channel.name} (${channel.id}) by ${interaction.user.tag}`
      );
    }
  } catch (error) {
    console.error("[COMMAND ERROR]", error);

    const reply = {
      content: "An error occurred while running this command.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});const embed = makeEmbed(
  "Join Logs Configured",
  `Server join notifications will be sent to ${channel}.\n\n` +
  "This is PYRR's global join-log destination."
);client.on(Events.GuildCreate, async guild => {
  console.log(
    `[GUILD JOIN] Joined ${guild.name} (${guild.id})`
  );

  try {
    let ownerText = "Unknown";
    let ownerId = guild.ownerId;

    try {
      const owner = await guild.fetchOwner();
      ownerText = `${owner.user.tag} (${owner.id})`;
    } catch (error) {
      console.warn("[GUILD JOIN] Could not fetch owner:", error.message);

      if (ownerId) {
        ownerText = `Unknown user (${ownerId})`;
      }
    }

    const inviteUrl = await createFallbackInvite(guild);

    const embed = makeEmbed(
      "PYRR Joined a Server",
      [
        `**Server:** ${guild.name}`,
        `**Server ID:** \`${guild.id}\``,
        `**Owner:** ${ownerText}`,
        `**Owner ID:** \`${ownerId || "Unknown"}\``,
        `**Members:** ${guild.memberCount ?? "Unknown"}`,
        `**Joined:** <t:${Math.floor(Date.now() / 1000)}:F>`,
        "",
        "**Invite Link:**",
        inviteUrl
          ? `[Open server invite](${inviteUrl})`
          : "Unavailable — PYRR lacks permission to create an invite."
      ].join("\n")
    );

    const sent = await sendJoinLog(embed);

    if (sent) {
      console.log(`[JOIN LOG] Sent log for ${guild.name}.`);
    } else {
      console.warn(
        `[JOIN LOG] Log for ${guild.name} was not delivered. Configure /join_logs first.`
      );
    }

    updatePyrrPresence();
  } catch (error) {
    console.error(
      `[GUILD JOIN] Failed to process ${guild.name}:`,
      error
    );
  }
});

client.on(Events.GuildDelete, guild => {
  console.log(
    `[GUILD LEAVE] Left or was removed from ${guild.name} (${guild.id})`
  );

  updatePyrrPresence();
});

client.once(Events.ClientReady, async readyClient => {
  console.log(`[READY] Logged in as ${readyClient.user.tag}`);
  console.log(`[READY] Connected to ${client.guilds.cache.size} servers.`);

  updatePyrrPresence();

  try {
    await registerCommands();
  } catch (error) {
    console.error("[COMMANDS] Registration failed:", error);
  }

  setInterval(updatePyrrPresence, 60_000);
});

client.on(Events.Error, error => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

process.on("unhandledRejection", error => {
  console.error("[UNHANDLED REJECTION]", error);
});

client.login(config.token).catch(error => {
  console.error("[LOGIN ERROR] PYRR could not log in:", error);
  process.exitCode = 1;
});
