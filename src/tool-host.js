class WhereaboutsToolHost {
  constructor({ service }) {
    this.service = service;
  }

  listTools() {
    return PROJECT_TOOLS.map((tool) => ({
      name: tool.name,
      description: buildToolDescription(tool),
      inputSchema: tool.inputSchema,
    }));
  }

  async invokeTool(toolName, args = {}) {
    const spec = PROJECT_TOOLS.find((candidate) => candidate.name === toolName);
    if (!spec) {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    const normalizedArgs = args && typeof args === "object" ? args : {};
    validateSchema(spec.inputSchema, normalizedArgs, toolName, "input");
    return await spec.handler({
      service: this.service,
      args: normalizedArgs,
    });
  }
}

const PROJECT_TOOLS = [
  {
    name: "whereabouts_snapshot",
    description: "Return the current stay plus recent stays and major movement events.",
    inputSchema: {
      type: "object",
      properties: {
        stayLimit: { type: "integer", description: "Optional number of recent stays to include." },
        moveLimit: { type: "integer", description: "Optional number of recent moves to include." },
        batteryBucketMinutes: { type: "integer", description: "Optional battery trend bucket size in minutes." },
      },
      additionalProperties: false,
    },
    async handler({ service, args }) {
      const snapshot = service.getSnapshot(args);
      const currentLabel = normalizeText(snapshot?.currentStay?.address) || "unknown";
      return {
        text: `Whereabouts snapshot loaded. Current stay: ${currentLabel}.`,
        data: snapshot,
      };
    },
  },
  {
    name: "whereabouts_current_stay",
    description: "Return the current stay inferred from the latest merged location samples.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async handler({ service }) {
      const currentStay = service.getCurrentStayForOutput();
      return {
        text: currentStay ? "Current stay loaded." : "No current stay available yet.",
        data: {
          currentStay,
        },
      };
    },
  },
  {
    name: "whereabouts_recent_stays",
    description: "Return recent closed stays together with the current stay.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Optional number of closed stays to include." },
      },
      additionalProperties: false,
    },
    async handler({ service, args }) {
      const result = service.getRecentStaysForOutput(args);
      return {
        text: `Recent stays loaded: ${result.recentStays.length}.`,
        data: result,
      };
    },
  },
  {
    name: "whereabouts_recent_moves",
    description: "Return recent major movement events together with the current stay.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Optional number of movement events to include." },
      },
      additionalProperties: false,
    },
    async handler({ service, args }) {
      const result = service.getRecentMovesForOutput(args);
      return {
        text: `Recent moves loaded: ${result.recentMovementEvents.length}.`,
        data: result,
      };
    },
  },
  {
    name: "whereabouts_summary",
    description: "Return a day, week, or month summary with stay duration, movement count, battery trend, and mobility state.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          enum: ["day", "week", "month"],
          description: "Summary range: day, week, or month. Defaults to day.",
        },
        batteryBucketMinutes: { type: "integer", description: "Optional battery trend bucket size in minutes." },
      },
      additionalProperties: false,
    },
    async handler({ service, args }) {
      const result = service.getSummary(args);
      return {
        text: `Whereabouts ${result.range} summary loaded: ${result.stayCount} stays, ${result.moveCount} moves.`,
        data: result,
      };
    },
  },
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildToolDescription(tool) {
  const baseDescription = normalizeText(tool?.description);
  const signature = summarizeSchema(tool?.inputSchema);
  if (!signature) {
    return baseDescription;
  }
  return `${baseDescription} Input: ${signature}`;
}

function summarizeSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return "";
  }
  const schemaType = normalizeText(schema.type).toLowerCase();
  if (schemaType === "object") {
    const properties = schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const entries = Object.entries(properties);
    if (!entries.length) {
      return "{}";
    }
    const parts = entries.map(([key, value]) => {
      const suffix = required.has(key) ? "" : "?";
      return `${key}${suffix}: ${summarizeSchema(value) || "any"}`;
    });
    return `{ ${parts.join(", ")} }`;
  }
  if (schemaType === "array") {
    const itemSummary = summarizeSchema(schema.items) || "any";
    return `${itemSummary}[]`;
  }
  if (schemaType === "integer" || schemaType === "number" || schemaType === "string" || schemaType === "boolean") {
    return schemaType;
  }
  return schemaType || "any";
}

function validateSchema(schema, value, toolName, path) {
  if (!schema || typeof schema !== "object") {
    return;
  }
  const schemaType = schema.type;
  if (schemaType === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${toolName} ${path} must be an object.`);
    }
    const properties = schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in value)) {
        throw new Error(`${toolName} ${path}.${key} is required.`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          throw new Error(`${toolName} ${path}.${key} is not allowed.`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        validateSchema(propertySchema, value[key], toolName, `${path}.${key}`);
      }
    }
    return;
  }
  if (schemaType === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${toolName} ${path} must be an array.`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchema(schema.items, item, toolName, `${path}[${index}]`));
    }
    return;
  }
  if (schemaType === "string" && typeof value !== "string") {
    throw new Error(`${toolName} ${path} must be a string.`);
  }
  if (schemaType === "boolean" && typeof value !== "boolean") {
    throw new Error(`${toolName} ${path} must be a boolean.`);
  }
  if (schemaType === "integer" && !Number.isInteger(value)) {
    throw new Error(`${toolName} ${path} must be an integer.`);
  }
  if (schemaType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${toolName} ${path} must be a number.`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new Error(`${toolName} ${path} must be one of: ${schema.enum.join(", ")}.`);
  }
}

module.exports = {
  WhereaboutsToolHost,
};
