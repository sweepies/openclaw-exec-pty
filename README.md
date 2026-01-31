# OpenClaw Exec PTY Plugin

A plugin for [OpenClaw](https://openclaw.ai) that provides PTY-based shell command execution.

## What It Does

The standard `exec` tool in OpenClaw runs commands in non-interactive shells using `bash -l -c`. While efficient, this approach doesn't trigger shell prompt hooks or fully initialize the environment from shell configuration files.

This plugin provides an `exec_pty` tool that creates a **real pseudo-terminal (PTY)** session. The PTY behaves like an actual terminal window:

- Displays a shell prompt
- Sources all shell initialization files (`.bash_profile`, `.bashrc`, `.zshrc`, etc.)
- Triggers `PROMPT_COMMAND` and other shell hooks
- Provides full terminal capabilities for interactive tools

## Why Use This?

Use `exec_pty` instead of regular `exec` when:

- Tools need environment variables set by shell hooks
- Running commands that check for terminal presence (`isatty()`)
- Interactive CLI tools need proper terminal handling
- Shell initialization must be complete (e.g., conda, fnm, asdf, or custom shell tools)

## Installation

### Method 1: Install via OpenClaw CLI (Recommended)

```bash
# Clone or download this repository
git clone https://github.com/YOUR_USERNAME/openclaw-exec-pty.git

# Install via OpenClaw
openclaw plugins install ./openclaw-exec-pty
```

### Method 2: Manual Installation

```bash
# Copy to extensions directory
cp -r openclaw-exec-pty ~/.openclaw/extensions/

# Install dependencies
cd ~/.openclaw/extensions/openclaw-exec-pty
pnpm install
```

### Requirements

- OpenClaw >= 2026.1.0
- `@lydell/node-pty` peer dependency:
  ```bash
  pnpm add @lydell/node-pty
  # or
  npm install @lydell/node-pty
  ```

## Configuration

### Option A: Replace Regular Exec (Recommended)

Configure your agent to use `exec_pty` instead of the built-in `exec`:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": ["exec_pty", "read", "write"],
          "deny": ["exec"]
        }
      }
    ]
  }
}
```

### Option B: Allow Both (Agent Chooses)

Let the agent decide which tool to use:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": ["exec", "exec_pty", "read", "write"]
        }
      }
    ]
  }
}
```

The agent will typically use `exec_pty` for commands requiring proper shell initialization.

## Usage

The `exec_pty` tool accepts the following parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `command` | string | Yes | - | Shell command to execute |
| `workdir` | string | No | Current dir | Working directory for the command |
| `env` | object | No | Inherited | Environment variables (key-value pairs) |
| `timeout` | number | No | 60 | Timeout in seconds (1-300) |
| `cols` | number | No | 120 | Terminal width in columns (20-300) |
| `rows` | number | No | 30 | Terminal height in rows (10-100) |

### Example

```json
{
  "command": "node --version && npm --version",
  "workdir": "/home/user/project",
  "timeout": 30,
  "env": {
    "NODE_ENV": "production"
  }
}
```

## How It Works

1. **Spawns PTY**: Creates a pseudo-terminal with the user's shell (`$SHELL` or `/bin/bash`)
2. **Login Shell**: Uses `-l` flag to source all shell initialization files
3. **Prompt Display**: The PTY displays a prompt, triggering shell hooks
4. **Command Execution**: Sends the command to the PTY as if typed by a user
5. **Output Capture**: Captures all terminal output (stdout + stderr combined)
6. **Exit Detection**: Monitors process exit and returns results

## Security Considerations

- Runs on the **host** system (not in Docker sandbox)
- Inherits the full environment from the parent process
- Subject to OpenClaw's tool policy system (requires explicit allowlist)
- Commands run with the same permissions as the OpenClaw gateway process
- Timeout limits prevent runaway processes (max 5 minutes)

## Limitations

- Not available in Docker sandbox mode (returns `null` when `ctx.sandboxed`)
- Requires `@lydell/node-pty` as a peer dependency
- Slightly more overhead than non-interactive `exec`
- Output includes shell prompts and terminal control sequences (if any)

## Troubleshooting

### "PTY support unavailable"

Install the peer dependency:

```bash
cd ~/.openclaw/extensions/openclaw-exec-pty
pnpm add @lydell/node-pty
```

### Commands hang or timeout

- Check if the command is waiting for interactive input
- Increase `timeout` parameter (up to 300 seconds)
- Some commands may need explicit termination (e.g., `exit` at end)

### Shell not found

Ensure `SHELL` environment variable is set, or the plugin defaults to `/bin/bash`.

## License

MIT

## Contributing

Issues and pull requests welcome. This is an unofficial community plugin.
