import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { createExecPtyTool } from "./src/exec-pty-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    (ctx) => {
      // Available on gateway/host, not in Docker sandbox
      if (ctx.sandboxed) return null;
      return createExecPtyTool(api);
    },
    { optional: true }, // Must be explicitly allowed in tool policy
  );
}
