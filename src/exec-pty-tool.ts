import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

type IPty = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(callback: (data: string) => void): void;
  onExit(callback: (e: { exitCode: number; signal?: number }) => void): void;
  kill(signal?: string): void;
};

type PtyModule = {
  spawn?: (
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    }
  ) => IPty;
  default?: { spawn?: PtyModule["spawn"] };
};

const execPtySchema = Type.Object({
  command: Type.String({ description: "Shell command to execute via PTY" }),
  workdir: Type.Optional(Type.String({ description: "Working directory" })),
  env: Type.Optional(Type.Record(Type.String(), Type.String(), { 
    description: "Environment variables" 
  })),
  timeout: Type.Optional(Type.Number({ 
    description: "Timeout in seconds (default: 60, max: 300)" 
  })),
  cols: Type.Optional(Type.Number({ description: "Terminal columns", default: 120 })),
  rows: Type.Optional(Type.Number({ description: "Terminal rows", default: 30 })),
});

export function createExecPtyTool(api: OpenClawPluginApi): AgentTool {
  return {
    name: "exec_pty",
    description: 
      "Execute shell commands in a PTY (pseudo-terminal). " +
      "Unlike regular exec which uses non-interactive shells, " +
      "this creates a real terminal session that sources shell initialization files " +
      "(like .bash_profile, .bashrc, .zshrc) and fires prompt hooks. " +
      "Use this when you need tools that rely on shell hooks or when " +
      "environment initialization requires an interactive session. " +
      "Supports: command, workdir, env, timeout, cols, rows.",
    inputSchema: execPtySchema,
    
    async execute(callId: string, args: unknown): Promise<AgentToolResult> {
      const params = args as {
        command: string;
        workdir?: string;
        env?: Record<string, string>;
        timeout?: number;
        cols?: number;
        rows?: number;
      };

      // Clamp timeout between 1-300 seconds
      const timeoutSec = Math.min(Math.max(params.timeout ?? 60, 1), 300);
      const timeoutMs = timeoutSec * 1000;
      
      // Clamp terminal dimensions
      const cols = Math.min(Math.max(params.cols ?? 120, 20), 300);
      const rows = Math.min(Math.max(params.rows ?? 30, 10), 100);

      try {
        // Dynamically import node-pty (peer dependency)
        const ptyModule = (await import("@lydell/node-pty")) as unknown as PtyModule;
        const spawnPty = ptyModule.spawn ?? ptyModule.default?.spawn;
        
        if (!spawnPty) {
          throw new Error(
            "PTY support unavailable. Ensure @lydell/node-pty is installed. " +
            "Install with: pnpm add @lydell/node-pty"
          );
        }

        const shell = process.env.SHELL ?? "/bin/bash";
        const cwd = params.workdir ?? process.cwd();
        
        // Merge environment
        const env: Record<string, string> = {
          ...process.env as Record<string, string>,
          TERM: process.env.TERM ?? "xterm-256color",
          ...params.env,
        };

        // Spawn PTY with login shell (-l) - this sources shell profiles
        const pty = spawnPty(shell, ["-l"], {
          name: "xterm-256color",
          cols,
          rows,
          cwd,
          env,
        });

        let output = "";
        let exited = false;
        let exitCode = 0;
        let signal: number | undefined;

        // Collect output
        pty.onData((data) => {
          output += data;
        });

        // Handle exit
        const exitPromise = new Promise<{ exitCode: number; signal?: number }>((resolve) => {
          pty.onExit((event) => {
            exited = true;
            resolve(event);
          });
        });

        // Send command followed by exit
        // The \r simulates pressing Enter
        pty.write(`${params.command}\r`);
        pty.write("exit\r");

        // Race between timeout and process exit
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Command timed out after ${timeoutSec}s`));
          }, timeoutMs);
        });

        try {
          const result = await Promise.race([exitPromise, timeoutPromise]);
          exitCode = result.exitCode;
          signal = result.signal;
        } catch (timeoutErr) {
          // Timeout - kill the process
          try {
            pty.kill("SIGKILL");
          } catch {
            // Ignore errors during kill
          }
          throw timeoutErr;
        }

        // Clean up if still running
        if (!exited) {
          try {
            pty.kill("SIGTERM");
          } catch {
            // Ignore
          }
        }

        // Build result
        const success = exitCode === 0 && !signal;
        
        return {
          status: success ? "success" : "error",
          content: [
            {
              type: "text",
              text: output,
            },
          ],
          system: !success 
            ? `Exit code: ${exitCode}${signal ? ` (signal: ${signal})` : ""}`
            : undefined,
        };
      } catch (err) {
        return {
          status: "error",
          content: [
            {
              type: "text",
              text: String(err),
            },
          ],
        };
      }
    },
  };
}
