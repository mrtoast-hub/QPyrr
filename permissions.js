
"use strict";

function isBotOwner(userId) {
  return Boolean(
    process.env.OWNER_ID &&
    userId === process.env.OWNER_ID
  );
}

async function requireBotOwner(interaction) {
  if (isBotOwner(interaction.user.id)) {
    return true;
  }

  const message = {
    content: "This command is restricted to the bot owner.",
    ephemeral: true
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(message).catch(() => {});
  } else {
    await interaction.reply(message).catch(() => {});
  }

  return false;
}

module.exports = {
  isBotOwner,
  requireBotOwner
};
