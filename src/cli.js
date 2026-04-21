const { readConfig } = require("./config");
const {
  printLocationRecord,
  printMovementRecord,
} = require("./location-format");
const { runWhereaboutsMcpServer } = require("./mcp-stdio-server");
const { WhereaboutsService } = require("./whereabouts-service");
const { WhereaboutsToolHost } = require("./tool-host");

async function main() {
  const config = readConfig();
  const service = new WhereaboutsService({ config });
  const command = config.command;

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp(config);
    return;
  }

  if (command === "serve") {
    await runServeCommand(service, config);
    return;
  }

  if (command === "latest") {
    runLatestCommand(service, process.argv.slice(3));
    return;
  }

  if (command === "history") {
    runHistoryCommand(service, process.argv.slice(3));
    return;
  }

  if (command === "moves") {
    runMovesCommand(service, process.argv.slice(3));
    return;
  }

  if (command === "tool-mcp-server") {
    const toolHost = new WhereaboutsToolHost({ service });
    runWhereaboutsMcpServer({ toolHost });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function runServeCommand(service, config) {
  const options = parseServeArgs(process.argv.slice(3), config);
  if (options.help) {
    printServeHelp(config);
    return;
  }
  await service.startServer({
    host: options.host,
    port: options.port,
    token: options.token,
  });
  console.log(`whereabouts server listening on http://${options.host}:${options.port}`);
  console.log(`store: ${config.storeFile}`);
  await waitForShutdown(service);
}

function runLatestCommand(service, args) {
  const options = parseJsonOnlyArgs(args);
  const latest = service.getCurrentStay();
  if (!latest) {
    console.log("No location received yet.");
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(service.getCurrentStayForOutput(), null, 2));
    return;
  }
  printLocationRecord(latest);
}

function runHistoryCommand(service, args) {
  const options = parseHistoryArgs(args);
  const currentStay = service.getCurrentStay();
  const history = service.listRecentStays({ limit: options.limit });
  if (options.json) {
    console.log(JSON.stringify(service.getRecentStaysForOutput(options), null, 2));
    return;
  }
  if (!currentStay && !history.length) {
    console.log("No location received yet.");
    return;
  }
  if (currentStay) {
    console.log("current stay:");
    printLocationRecord(currentStay);
    if (history.length) {
      console.log("");
    }
  }
  for (const record of history) {
    printLocationRecord(record);
    console.log("");
  }
}

function runMovesCommand(service, args) {
  const options = parseHistoryArgs(args);
  const currentStay = service.getCurrentStay();
  const moves = service.listRecentMovementEvents({ limit: options.limit });
  if (options.json) {
    console.log(JSON.stringify(service.getRecentMovesForOutput(options), null, 2));
    return;
  }
  if (!currentStay && !moves.length) {
    console.log("No movement events received yet.");
    return;
  }
  if (currentStay) {
    console.log("current stay:");
    printLocationRecord(currentStay);
    if (moves.length) {
      console.log("");
    }
  }
  if (!moves.length) {
    console.log("No movement events received yet.");
    return;
  }
  for (const record of moves) {
    printMovementRecord(record);
    console.log("");
  }
}

function parseServeArgs(args, config) {
  const options = {
    help: false,
    host: config.host,
    port: config.port,
    token: config.token,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || "").trim();
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    const value = String(args[index + 1] || "").trim();
    if (!token.startsWith("--") || !value) {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (token === "--host") {
      options.host = value;
    } else if (token === "--port") {
      const port = Number.parseInt(value, 10);
      if (!Number.isFinite(port) || port <= 0) {
        throw new Error(`Invalid port: ${value}`);
      }
      options.port = port;
    } else if (token === "--token") {
      options.token = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

function parseJsonOnlyArgs(args) {
  return {
    json: Array.isArray(args) && args.some((arg) => arg === "--json"),
  };
}

function parseHistoryArgs(args) {
  const options = { json: false, limit: 20 };
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || "").trim();
    if (!token) {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--limit") {
      const value = Number.parseInt(String(args[index + 1] || "").trim(), 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("history requires a positive --limit");
      }
      options.limit = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printHelp(config) {
  console.log([
    "whereabouts-mcp <command>",
    "",
    "Commands:",
    "  serve            Start the local HTTP receiver for location uploads",
    "  latest           Print the current stay",
    "  history          Print recent closed stays",
    "  moves            Print recent major movement events",
    "  tool-mcp-server  Run the stdio MCP server",
    "",
    `Defaults: host=${config.host} port=${config.port}`,
  ].join("\n"));
}

function printServeHelp(config) {
  console.log([
    "Usage: whereabouts-mcp serve [--host 0.0.0.0] [--port 4318] [--token <secret>]",
    "",
    `Defaults: host=${config.host} port=${config.port}`,
    "Environment:",
    "  WHEREABOUTS_HOST",
    "  WHEREABOUTS_PORT",
    "  WHEREABOUTS_TOKEN",
    "  WHEREABOUTS_STAY_MERGE_RADIUS_METERS",
    "  WHEREABOUTS_STAY_BREAK_RADIUS_METERS",
    "  WHEREABOUTS_STAY_BREAK_SAMPLES",
    "  WHEREABOUTS_MAJOR_MOVE_THRESHOLD_METERS",
    "",
    "Endpoint:",
    "  POST /location/ingest",
    "  Authorization: Bearer <secret>",
    "  GET /healthz",
  ].join("\n"));
}

function waitForShutdown(service) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => {
      if (settled) {
        return;
      }
      settled = true;
      service.closeServer().then(resolve, reject);
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

module.exports = {
  main,
  parseHistoryArgs,
  parseJsonOnlyArgs,
  parseServeArgs,
};
