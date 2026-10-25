
"use strict";

const { SlashCommandBuilder, ChannelType } = require("discord.js");

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
        .setDescription("Channel for server join notifications.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
];

module.exports = commands;
