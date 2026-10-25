
"use strict";

const { EmbedBuilder } = require("discord.js");

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x111111)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PYRR | Server Management" })
    .setTimestamp();
}

module.exports = { createEmbed };
