"use strict";

const {
  Client, GatewayIntentBits, Partials, Events, REST, Routes,
  SlashCommandBuilder, ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActivityType
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig } = require("./config");

const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel]
});

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "settings.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { guilds: {}, joinLogChannelId: null };
  }
}

let data = readData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function guildSettings(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      welcomeChannelId: null,
      leaveChannelId: null,
      welcomeMessage: "Welcome {user} to **{server}**!",
      leaveMessage: "{user} has left **{server}**.",
      modLogChannelId: null,
      warnings: {},
      autoRoleId: null
    };
    saveData();
  }
  return data.guilds[guildId];
}

function embed(title, description = "") {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PYRR | Server Management" })
    .setTimestamp();
}

function ownerOnly(userId) {
  return userId === config.ownerId;
}

async function replyError(interaction, message) {
  const payload = { content: message, ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

async function logToChannel(guild, channelId, messageEmbed) {
  if (!channelId) return false;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !channel.send) return false;
    await channel.send({ embeds: [messageEmbed] });
    return true;
  } catch (error) {
    console.error("[LOG CHANNEL]", error.message);
    return false;
  }
}

async function makeInvite(guild) {
  try {
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      const me = guild.members.me;
      if (!me || !channel.permissionsFor(me)?.has(
        PermissionFlagsBits.CreateInstantInvite
      )) continue;

      try {
        const invite = await channel.createInvite({
          maxAge: 604800,
          maxUses: 0,
          unique: true,
          reason: "PYRR join log"
        });
        return invite.url;
      } catch {}
    }
  } catch (error) {
    console.error("[INVITE]", error.message);
  }
  return null;
}

function formatTemplate(template, member) {
  return template
    .replaceAll("{user}", `${member}`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount));
}

function canModerate(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ModerateMembers
  ) || ownerOnly(interaction.user.id);
}

function isTextChannel(channel) {
  return channel && channel.type === ChannelType.GuildText;
}

function userOption(command) {
  return command.addUserOption(option =>
    option.setName("user").setDescription("Target user").setRequired(true)
  );
}

function reasonOption(command) {
  return command.addStringOption(option =>
    option.setName("reason").setDescription("Reason for this action")
      .setMaxLength(500).setRequired(false)
  );
}const slash = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot latency."),
  new SlashCommandBuilder().setName("help").setDescription("Show PYRR commands."),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Show server details."),
  new SlashCommandBuilder().setName("userinfo").setDescription("Show a user's details.")
    .addUserOption(o => o.setName("user").setDescription("Target user")),
  new SlashCommandBuilder().setName("avatar").setDescription("Show a user's avatar.")
    .addUserOption(o => o.setName("user").setDescription("Target user")),
  new SlashCommandBuilder().setName("join_logs").setDescription("Set global bot join-log channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Log channel")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("welcome").setDescription("Set welcome channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Welcome channel")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("leave").setDescription("Set member-leave channel.")
    .addChannelOption(o => o.setName("channel").setDescription("Leave channel")
      .addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("setwelcome").setDescription("Set welcome message.")
    .addStringOption(o => o.setName("message").setDescription("Use {user}, {server}, {count}")
      .setMaxLength(1000).setRequired(true)),
  new SlashCommandBuilder().setName("setleave").setDescription("Set leave message.")
    .addStringOption(o => o.setName("message").setDescription("Use {user}, {server}, {count}")
      .setMaxLength(1000).setRequired(true)),
  new SlashCommandBuilder().setName("kick").setDescription("Kick a member.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("ban").setDescription("Ban a member.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("timeout").setDescription("Timeout a member.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes")
      .setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)),
  new SlashCommandBuilder().setName("untimeout").setDescription("Remove a member timeout.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true)),
  new SlashCommandBuilder().setName("warn").setDescription("Warn a member.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setMaxLength(500)
      .setRequired(true)),
  new SlashCommandBuilder().setName("warnings").setDescription("Show a member's warnings.")
    .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true)),
  new SlashCommandBuilder().setName("clear").setDescription("Bulk-delete recent messages.")
    .addIntegerOption(o => o.setName("amount").setDescription("1 to 100")
      .setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slowmode.")
    .addIntegerOption(o => o.setName("seconds").setDescription("0 to 21600 seconds")
      .setMinValue(0).setMaxValue(21600).setRequired(true)),
  new SlashCommandBuilder().setName("lock").setDescription("Lock this text channel."),
  new SlashCommandBuilder().setName("unlock").setDescription("Unlock this text channel."),
  new SlashCommandBuilder().setName("steal").setDescription("Add a custom emoji from an emoji or image URL.")
    .addStringOption(o => o.setName("emoji").setDescription("Custom emoji or image URL")
      .setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("New emoji name")
      .setMinLength(2).setMaxLength(32).setRequired(true))
].map(command => command.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationCommands(config.clientId), { body: slash });
  console.log(`[COMMANDS] Registered ${slash.length} slash commands.`);
}

async function stealEmoji(guild, source, name) {
  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
  if (cleanName.length < 2) throw new Error("Emoji name must be at least 2 characters.");

  const custom = source.match(/<a?:\w+:(\d+)>/);
  let imageUrl = source;

  if (custom) {
    const animated = source.startsWith("<a:");
    imageUrl = `https://cdn.discordapp.com/emojis/${custom[1]}.${animated ? "gif" : "png"}?size=128&quality=lossless`;
  } else if (!/^https:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(source)) {
    throw new Error("Provide a custom emoji or a direct HTTPS image URL ending in png, jpg, gif, or webp.");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Could not download the emoji image.");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error("The URL did not return an image.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 256 * 1024) throw new Error("Emoji image is larger than 256 KB.");

  return guild.emojis.create({
    attachment: buffer,
    name: cleanName,
    reason: "Emoji added using PYRR"
  });
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild, member, user } = interaction;

  try {
    if (commandName === "ping") {
      return interaction.reply({ embeds: [embed("Pong", `WebSocket latency: ${client.ws.ping} ms`)] });
    }

    if (commandName === "help") {
      return interaction.reply({
        embeds: [embed("PYRR Commands",
          "`/ping` `/serverinfo` `/userinfo` `/avatar`\n" +
          "`/kick` `/ban` `/timeout` `/untimeout` `/warn` `/warnings`\n" +
          "`/clear` `/slowmode` `/lock` `/unlock`\n" +
          "`/welcome` `/leave` `/setwelcome` `/setleave`\n" +
          "`/join_logs` `/steal`\n\nPrefix examples: `qhelp`, `qping`, `qsteal`."
        )],
        ephemeral: true
      });
    }

    if (commandName === "join_logs") {
      if (!ownerOnly(user.id)) return replyError(interaction, "This command is bot-owner only.");
      const channel = interaction.options.getChannel("channel", true);
      data.joinLogChannelId = channel.id;
      saveData();
      return interaction.reply({ content: `Global join logs set to ${channel}.`, ephemeral: true });
    }

    if (!guild) return replyError(interaction, "Use this command inside a server.");

    const gs = guildSettings(guild.id);

    if (commandName === "welcome" || commandName === "leave") {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyError(interaction, "You need Manage Server permission.");
      }
      const channel = interaction.options.getChannel("channel", true);
      if (commandName === "welcome") gs.welcomeChannelId = channel.id;
      else gs.leaveChannelId = channel.id;
      saveData();
      return interaction.reply({ content: `${commandName} channel set to ${channel}.`, ephemeral: true });
    }

    if (commandName === "setwelcome" || commandName === "setleave") {
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyError(interaction, "You need Manage Server permission.");
      }
      const message = interaction.options.getString("message", true);
      if (commandName === "setwelcome") gs.welcomeMessage = message;
      else gs.leaveMessage = message;
      saveData();
      return interaction.reply({ content: "Message template saved. Variables: `{user}`, `{username}`, `{server}`, `{count}`.", ephemeral: true });
    }

    if (commandName === "serverinfo") {
      return interaction.reply({ embeds: [embed(guild.name,
        `**ID:** ${guild.id}\n**Owner:** <@${guild.ownerId}>\n` +
        `**Members:** ${guild.memberCount}\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
      )] });
    }

    if (commandName === "userinfo") {
      const target = interaction.options.getUser("user") || user;
      return interaction.reply({ embeds: [embed(target.tag,
        `**ID:** ${target.id}\n**Account created:** <t:${Math.floor(target.createdTimestamp / 1000)}:F>\n` +
        `**Bot:** ${target.bot ? "Yes" : "No"}`
      ).setThumbnail(target.displayAvatarURL({ size: 256 }))] });
    }

    if (commandName === "avatar") {
      const target = interaction.options.getUser("user") || user;
      return interaction.reply({ embeds: [embed(`${target.username}'s avatar`,
        `[Open full-size avatar](${target.displayAvatarURL({ size: 1024 })})`
      ).setImage(target.displayAvatarURL({ size: 1024 }))] });
    }

    if (commandName === "steal") {
      if (!member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
        return replyError(interaction, "You need Manage Emojis and Stickers permission.");
      }
      await interaction.deferReply({ ephemeral: true });
      const created = await stealEmoji(
        guild,
        interaction.options.getString("emoji", true),
        interaction.options.getString("name", true)
      );
      return interaction.editReply(`Added emoji: ${created}`);
  }    if (["kick", "ban", "timeout", "untimeout", "warn", "warnings",
         "clear", "slowmode", "lock", "unlock"].includes(commandName)) {
      if (!canModerate(interaction)) {
        return replyError(interaction, "You need the appropriate moderation permission.");
      }

      const options = interaction.options;
      const reason = options.getString("reason") || `Action by ${user.tag}`;

      if (["kick", "ban", "timeout", "untimeout", "warn", "warnings"].includes(commandName)) {
        const target = options.getUser("user", commandName !== "warnings");
        if (!target) return replyError(interaction, "Select a user.");

        if (commandName === "warnings") {
          const list = gs.warnings[target.id] || [];
          return interaction.reply({
            embeds: [embed(`Warnings: ${target.tag}`,
              list.length ? list.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${w.at}:R>`).join("\n") : "No warnings recorded."
            )],
            ephemeral: true
          });
        }

        if (target.id === user.id || target.id === client.user.id) {
          return replyError(interaction, "You cannot target yourself or PYRR.");
        }

        if (commandName === "warn") {
          gs.warnings[target.id] ||= [];
          gs.warnings[target.id].push({
            reason: options.getString("reason", true),
            at: Math.floor(Date.now() / 1000),
            moderator: user.id
          });
          saveData();
          await logToChannel(guild, gs.modLogChannelId,
            embed("Member Warned", `**User:** ${target.tag}\n**Moderator:** ${user.tag}\n**Reason:** ${reason}`)
          );
          return interaction.reply({ content: `${target.tag} has been warned.`, ephemeral: true });
        }

        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember) return replyError(interaction, "That user is not a current member.");

        const botMember = guild.members.me;
        if (!botMember) return replyError(interaction, "Could not verify PYRR's server permissions.");

        if (targetMember.id !== guild.ownerId &&
            targetMember.roles.highest.position >= botMember.roles.highest.position) {
          return replyError(interaction, "That member's highest role is equal to or higher than PYRR's.");
        }

        if (commandName === "kick") {
          if (!member.permissions.has(PermissionFlagsBits.KickMembers) && !ownerOnly(user.id))
            return replyError(interaction, "You need Kick Members permission.");
          await targetMember.kick(reason);
          return interaction.reply({ content: `Kicked **${target.tag}**. Reason: ${reason}` });
        }

        if (commandName === "ban") {
          if (!member.permissions.has(PermissionFlagsBits.BanMembers) && !ownerOnly(user.id))
            return replyError(interaction, "You need Ban Members permission.");
          await targetMember.ban({ reason });
          return interaction.reply({ content: `Banned **${target.tag}**. Reason: ${reason}` });
        }

        if (commandName === "timeout") {
          if (!member.permissions.has(PermissionFlagsBits.ModerateMembers) && !ownerOnly(user.id))
            return replyError(interaction, "You need Moderate Members permission.");
          const minutes = options.getInteger("minutes", true);
          await targetMember.timeout(minutes * 60_000, reason);
          return interaction.reply({ content: `Timed out **${target.tag}** for ${minutes} minute(s).` });
        }

        if (commandName === "untimeout") {
          if (!member.permissions.has(PermissionFlagsBits.ModerateMembers) && !ownerOnly(user.id))
            return replyError(interaction, "You need Moderate Members permission.");
          await targetMember.timeout(null, reason);
          return interaction.reply({ content: `Removed timeout for **${target.tag}**.` });
        }
      }

      if (commandName === "clear") {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages) && !ownerOnly(user.id))
          return replyError(interaction, "You need Manage Messages permission.");
        const amount = options.getInteger("amount", true);
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `Deleted ${deleted.size} recent messages.`, ephemeral: true });
      }

      if (commandName === "slowmode") {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !ownerOnly(user.id))
          return replyError(interaction, "You need Manage Channels permission.");
        await interaction.channel.setRateLimitPerUser(options.getInteger("seconds", true));
        return interaction.reply({ content: "Slowmode updated.", ephemeral: true });
      }

      if (commandName === "lock" || commandName === "unlock") {
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !ownerOnly(user.id))
          return replyError(interaction, "You need Manage Channels permission.");
        const everyone = guild.roles.everyone;
        await interaction.channel.permissionOverwrites.edit(everyone, {
          SendMessages: commandName === "unlock" ? null : false
        });
        return interaction.reply({ content: `Channel ${commandName === "lock" ? "locked" : "unlocked"}.` });
      }
    }
  } catch (error) {
    console.error(`[COMMAND:${interaction.commandName}]`, error);
    return replyError(interaction, `Command failed: ${error.message || "Unknown error"}`);
  }
});

async function sendMemberEvent(member, type) {
  const gs = guildSettings(member.guild.id);
  const channelId = type === "welcome" ? gs.welcomeChannelId : gs.leaveChannelId;
  if (!channelId) return;

  try {
    const channel = await member.guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || !channel.send) return;

    const message = type === "welcome" ? gs.welcomeMessage : gs.leaveMessage;
    const card = embed(
      type === "welcome" ? "Member Joined" : "Member Left",
      formatTemplate(message, member)
    )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "User", value: `${member.user.tag}\n\`${member.id}\``, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
      );

    if (type === "welcome") {
      card.addFields({ name: "Member Count", value: String(member.guild.memberCount), inline: true });
    }

    await channel.send({ embeds: [card] });
  } catch (error) {
    console.error(`[${type.toUpperCase()}]`, error.message);
  }
}

client.on(Events.GuildMemberAdd, async member => {
  await sendMemberEvent(member, "welcome");

  const gs = guildSettings(member.guild.id);
  if (gs.autoRoleId) {
    const role = await member.guild.roles.fetch(gs.autoRoleId).catch(() => null);
    if (role && member.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await member.roles.add(role).catch(error =>
        console.error("[AUTO ROLE]", error.message)
      );
    }
  }
});

client.on(Events.GuildMemberRemove, member => {
  sendMemberEvent(member, "leave").catch(console.error);
});

client.on(Events.GuildCreate, async guild => {
  console.log(`[GUILD JOIN] ${guild.name} (${guild.id})`);

  try {
    const owner = await guild.fetchOwner().catch(() => null);
    const invite = await makeInvite(guild);

    const card = embed("PYRR Joined a Server", [
      `**Server:** ${guild.name}`,
      `**Server ID:** \`${guild.id}\``,
      `**Owner:** ${owner ? `${owner.user.tag} (${owner.id})` : "Unavailable"}`,
      `**Members:** ${guild.memberCount ?? "Unknown"}`,
      `**Joined:** <t:${Math.floor(Date.now() / 1000)}:F>`,
      "",
      "**Invite link:**",
      invite ? `[New 7-day invite](${invite})` : "Unavailable — invite permission or suitable channel missing.",
      "",
      "*This is a newly created invite, not necessarily the original invite used to add PYRR.*"
    ].join("\n"));

    if (data.joinLogChannelId) {
      const channel = await client.channels.fetch(data.joinLogChannelId).catch(() => null);
      if (channel?.isTextBased() && channel.send) {
        await channel.send({ embeds: [card] });
      } else {
        console.warn("[JOIN LOG] Configured log channel is unavailable.");
      }
    } else {
      console.warn("[JOIN LOG] Run /join_logs first.");
    }
  } catch (error) {
    console.error("[GUILD JOIN]", error);
  }
});

// Prefix commands: qping, qhelp, qserverinfo, qsteal <emoji> <name>, qsay <text>
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.toLowerCase().startsWith("q")) return;

  const args = message.content.trim().split(/\s+/);
  const command = args.shift().slice(1).toLowerCase();
  if (!command) return;

  try {
    if (command === "ping") {
      return message.reply(`Pong! WebSocket latency: ${client.ws.ping} ms`);
    }

    if (command === "help") {
      return message.reply({
        embeds: [embed("PYRR Prefix Commands",
          "`qping` — latency\n`qhelp` — this help\n`qserverinfo` — server details\n" +
          "`qsteal <emoji> <name>` — add a custom emoji\n`qsay <text>` — send text (Manage Messages required)\n\n" +
          "Moderation and configuration commands are available as slash commands."
        )]
      });
    }

    if (command === "serverinfo") {
      return message.reply({ embeds: [embed(message.guild.name,
        `**ID:** ${message.guild.id}\n**Members:** ${message.guild.memberCount}\n**Owner ID:** ${message.guild.ownerId}`
      )] });
    }

    if (command === "steal" || command === "qsteal") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers) &&
          !ownerOnly(message.author.id)) {
        return message.reply("You need Manage Emojis and Stickers permission.");
      }

      const source = args.shift();
      const name = args.shift();
      if (!source || !name) {
        return message.reply("Usage: `qsteal <custom-emoji-or-image-URL> <name>`");
      }

      const created = await stealEmoji(message.guild, source, name);
      return message.reply(`Added emoji: ${created}`);
    }

    if (command === "say") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages) &&
          !ownerOnly(message.author.id)) {
        return message.reply("You need Manage Messages permission.");
      }
      const text = args.join(" ").slice(0, 1800);
      if (!text) return message.reply("Usage: `qsay <message>`");
      return message.channel.send({ embeds: [embed("Message", text)] });
    }
  } catch (error) {
    console.error(`[PREFIX:${command}]`, error);
    return message.reply(`Command failed: ${error.message || "Unknown error"}`).catch(() => {});
  }
});

client.once(Events.ClientReady, async ready => {
  console.log(`[READY] Logged in as ${ready.user.tag}`);
  ready.user.setPresence({
    status: "online",
    activities: [{ name: "One Piece", type: ActivityType.Watching }]
  });

  try {
    await registerSlashCommands();
  } catch (error) {
    console.error("[COMMAND REGISTRATION]", error);
  }
});

client.on(Events.Error, error => console.error("[CLIENT ERROR]", error));

process.on("unhandledRejection", error => {
  console.error("[UNHANDLED REJECTION]", error);
});

client.login(config.token).catch(error => {
  console.error("[LOGIN FAILED]", error);
  process.exitCode = 1;
});
/* =========================
   PYRR PART 4 — UTILITIES
   ========================= */

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const prefix = "q";
    if (!message.content.toLowerCase().startsWith(prefix)) return;

    const input = message.content.slice(prefix.length).trim();
    if (!input) return;

    const [rawCommand, ...args] = input.split(/\s+/);
    const command = rawCommand.toLowerCase();

    const sendEmbed = (title, description) => {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: "PYRR | Utility System" })
            .setTimestamp()
        ]
      });
    };

    // qroll [maximum]
    if (command === "roll") {
      const max = args[0] === undefined ? 100 : Number(args[0]);

      if (!Number.isInteger(max) || max < 1 || max > 1000000) {
        return sendEmbed("Invalid Number", "Usage: `qroll [1-1000000]`");
      }

      const result = Math.floor(Math.random() * max) + 1;
      return sendEmbed("Dice Roll", `${message.author} rolled **${result}** (1–${max}).`);
    }

    // qcoinflip
    if (command === "coinflip") {
      const result = Math.random() < 0.5 ? "Heads" : "Tails";
      return sendEmbed("Coin Flip", `${message.author} got **${result}**.`);
    }

    // qchoose option one | option two | option three
    if (command === "choose") {
      const options = args.join(" ").split("|")
        .map(option => option.trim())
        .filter(Boolean);

      if (options.length < 2) {
        return sendEmbed("Usage", "`qchoose option one | option two`");
      }

      const choice = options[Math.floor(Math.random() * options.length)];
      return sendEmbed("Choice", `I choose: **${choice}**`);
    }

    // q8ball question
    if (command === "8ball") {
      if (!args.length) {
        return sendEmbed("Usage", "`q8ball your question`");
      }

      const answers = [
        "Absolutely.", "Most likely.", "It is possible.",
        "Ask again later.", "Cannot determine right now.",
        "Probably not.", "Unlikely.", "Absolutely not."
      ];

      const answer = answers[Math.floor(Math.random() * answers.length)];
      return sendEmbed("Magic 8-Ball", `**Question:** ${args.join(" ")}\n**Answer:** ${answer}`);
    }

    // qservercount
    if (command === "servercount") {
      return sendEmbed(
        "Server Information",
        `**Server:** ${message.guild.name}\n**Members:** ${message.guild.memberCount}\n**Channels:** ${message.guild.channels.cache.size}\n**Roles:** ${message.guild.roles.cache.size}`
      );
    }

    // qbotinfo
    if (command === "botinfo") {
      const uptimeSeconds = Math.floor(client.uptime / 1000);
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);

      return sendEmbed(
        "PYRR Information",
        `**Servers:** ${client.guilds.cache.size}\n**Users cached:** ${client.users.cache.size}\n**Uptime:** ${days}d ${hours}h ${minutes}m\n**Library:** discord.js`
      );
    }

    // quserinfo [@user]
    if (command === "userinfo") {
      const target = message.mentions.members.first()
        || message.member;

      return sendEmbed(
        "User Information",
        `**User:** ${target.user.tag}\n**ID:** \`${target.id}\`\n**Account Created:** <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>\n**Joined Server:** ${target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` : "Unknown"}\n**Highest Role:** ${target.roles.highest}`
      );
    }

    // qavatar [@user]
    if (command === "avatar") {
      const target = message.mentions.users.first() || message.author;
      const avatar = target.displayAvatarURL({
        extension: "png",
        size: 1024
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x111111)
            .setTitle(`${target.username}'s Avatar`)
            .setImage(avatar)
            .setURL(avatar)
            .setFooter({ text: "PYRR | Utility System" })
        ]
      });
    }

    // qpoll question | option one | option two
    if (command === "poll") {
      const parts = args.join(" ").split("|")
        .map(part => part.trim())
        .filter(Boolean);

      if (parts.length < 3 || parts.length > 11) {
        return sendEmbed(
          "Usage",
          "`qpoll question | option one | option two`\nProvide 2–10 options."
        );
      }

      const [question, ...options] = parts;
      const reactions = [
        "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣",
        "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
      ];

      const pollMessage = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x111111)
            .setTitle("📊 " + question)
            .setDescription(options.map((option, i) =>
              `${reactions[i]} ${option}`
            ).join("\n"))
            .setFooter({ text: `Poll by ${message.author.username}` })
            .setTimestamp()
        ]
      });

      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(reactions[i]).catch(() => {});
      }

      return;
    }

    // qmembercount
    if (command === "membercount") {
      const members = await message.guild.members.fetch().catch(() => null);

      if (!members) {
        return sendEmbed(
          "Member Count",
          `Discord reports **${message.guild.memberCount}** members.`
        );
      }

      const bots = members.filter(member => member.user.bot).size;
      const humans = members.size - bots;

      return sendEmbed(
        "Member Count",
        `**Total:** ${members.size}\n**Humans:** ${humans}\n**Bots:** ${bots}`
      );
    }

    // qhelp2
    if (command === "help2") {
      return sendEmbed(
        "PYRR Utility Commands",
        [
          "`qroll [maximum]` — Roll a number.",
          "`qcoinflip` — Flip a coin.",
          "`qchoose a | b | c` — Choose an option.",
          "`q8ball question` — Ask the 8-ball.",
          "`qservercount` — Show server statistics.",
          "`qbotinfo` — Show bot uptime and statistics.",
          "`quserinfo [@user]` — Show user information.",
          "`qavatar [@user]` — Show an avatar.",
          "`qpoll question | option 1 | option 2` — Create a poll.",
          "`qmembercount` — Count members and bots."
        ].join("\n")
      );
    }
  } catch (error) {
    console.error("[PYRR PART 4]", error);
    await message.reply("An error occurred while running that command.")
      .catch(() => {});
  }
});
      
