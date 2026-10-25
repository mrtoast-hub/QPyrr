
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  Events
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !CLIENT_ID || !OWNER_ID) {
  throw new Error(
    "Missing DISCORD_TOKEN, CLIENT_ID, or OWNER_ID environment variables."
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "settings.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSettings() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
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
    .setColor(0x111111)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PYRR | Server Management" })
    .setTimestamp();
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's response time."),

  new SlashCommandBuilder()
    .setName("join_logs")
    .setDescription("Configure server join notifications.")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel that will receive join notifications.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
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
      const embed = makeEmbed(
        "Pong!",
        `API latency: ${client.ws.ping} ms`
      );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    if (interaction.commandName === "join_logs") {
      if (interaction.user.id !== OWNER_ID) {
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

      const channel = interaction.options.getChannel("channel", true);

      if (!channel.isTextBased() || !channel.guild) {
        return interaction.reply({
          content: "Please select a valid text channel.",
          ephemeral: true
        });
      }

      const botMember = interaction.guild.members.me;

      if (
        !botMember ||
        !channel.permissionsFor(botMember)?.has([
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
      content: "An unexpected error occurred while running this command.",
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
    if (!channel || !channel.isTextBased()) return;

    let ownerText = "Unavailable";

    try {
      const owner = await guild.fetchOwner();
      ownerText = `${owner.user.tag} (${owner.id})`;
    } catch {
      ownerText = "Could not retrieve server owner";
    }

    const embed = makeEmbed(
      "PYRR Joined a Server",
      [
        `**Server:** ${guild.name}`,
        `**Server ID:** ${guild.id}`,
        `**Server Owner:** ${ownerText}`,
        `**Member Count:** ${guild.memberCount}`,
        "",
        "The bot joined this server successfully.",
        "Original invite URL: Unavailable"
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

client.login(TOKEN);
                   
