
"use strict";

const { REST, Routes } = require("discord.js");
const { loadConfig } = require("./config");
const commands = require("./commands");

async function main() {
  const config = loadConfig();

  const rest = new REST({ version: "10" }).setToken(config.token);

  console.log("Registering PYRR slash commands...");

  await rest.put(
    Routes.applicationCommands(config.clientId),
    { body: commands.map(command => command.toJSON()) }
  );

  console.log("PYRR slash commands registered successfully.");
}

main().catch(error => {
  console.error("Failed to register slash commands:", error);
  process.exitCode = 1;
});
