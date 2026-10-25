
"use strict";

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
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

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "settings.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSettings() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Could not read settings:", error);
    return {};
  }
}

let settings = loadSettings();

function saveSettings() {
  const temporaryFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(settings, null, 2),
    "utf8"
  );

  fs.renameSync(temporaryFile, DATA_FILE);
}

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PYRR | Server Management" })
    .setTimestamp();
}

async function registerCommands() {
  const rest = new REST({ version: "10" })
    .setToken(config.token);

  await rest.put(
    Routes.applicationCommands(config.clientId),
    {
      body: commands.map(command => command.toJSON())
    }
  );

  console.log("Slash commands registered.");
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Command registration failed:", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "ping") {
      return interaction.reply({
        embeds: [
          makeEmbed(
            "Pong!",
            `API latency: ${client.ws.ping} ms`
          )
        ],
        ephemeral: true
      });
    }

    if (interaction.commandName === "join_logs") {
      if (interaction.user.id !== config.ownerId) {
        return interaction.reply({
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
        return interaction.reply({
          content: "This command can only be used in a server.",
          ephemeral: true
        });
      }

      const channel =
        interaction.options.getChannel("channel", true);

      if (
        !channel.isTextBased() ||
        channel.guildId !== interaction.guildId
      ) {
        return interaction.reply({
          content:
            "Please select a text channel in this server.",
          ephemeral: true
        });
      }

      const botMember = interaction.guild.members.me;

      const permissions = channel.permissionsFor(botMember);

      if (
        !permissions ||
        !permissions.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks
        ])
      ) {
        return interaction.reply({
          content:
            "I need View Channel, Send Messages, and Embed Links permissions in that channel.",
          ephemeral: true
        });
      }

      settings.joinLogChannelId = channel.id;
      saveSettings();

      return interaction.reply({
        embeds: [
          makeEmbed(
            "Join Logs Configured",
            `Server join notifications will be sent to ${channel}.`
          )
        ],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Command error:", error);

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

client.on(Events.GuildCreate, async guild => {
  const channelId = settings.joinLogChannelId;

  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    if (
      !channel ||
      !channel.isTextBased() ||
      !channel.guild
    ) {
      return;
    }

    let ownerText = "Unavailable";

    try {
      const owner = await guild.fetchOwner();
      ownerText = `${owner.user.tag} (${owner.id})`;
    } catch (error) {
      console.error("Could not fetch server owner:", error);
    }

    const embed = makeEmbed(
      "PYRR Joined a Server",
      [
        `**Server:** ${guild.name}`,
        `**Server ID:** ${guild.id}`,
        `**Server Owner:** ${ownerText}`,
        `**Member Count:** ${guild.memberCount}`,
        "",
        "PYRR has joined this server.",
        "**Original Invite:** Unavailable"
      ].join("\n")
    );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to send join notification:", error);
  }
});

client.on(Events.Error, error => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

client.login(config.token);
  
