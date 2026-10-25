
"use strict";

const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "OWNER_ID"
];

function loadConfig() {
  const missing = REQUIRED_ENV.filter(
    key => !process.env[key] || !process.env[key].trim()
  );

  if (missing.length) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }

  return Object.freeze({
    token: process.env.DISCORD_TOKEN.trim(),
    clientId: process.env.CLIENT_ID.trim(),
    ownerId: process.env.OWNER_ID.trim(),
    embedColor: 0x111111,
    embedTextColor: 0xFFFFFF,
    prefix: "q"
  });
}

module.exports = { loadConfig };
