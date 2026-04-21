#!/usr/bin/env node

const { main } = require("../src/cli");

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[whereabouts-mcp] ${message}`);
  process.exitCode = 1;
});
