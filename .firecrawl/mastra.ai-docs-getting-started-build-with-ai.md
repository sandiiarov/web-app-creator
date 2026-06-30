[Skip to main content](https://mastra.ai/docs/getting-started/build-with-ai#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

AI agents may not have up-to-date knowledge about Mastra's APIs, patterns, and best practices. These resources give your AI tools direct access to current Mastra documentation, enabling them to generate accurate code and help you build faster.

To give your agent access to Mastra's documentation, we recommend using **skills**. While the MCP docs server also provides this information, skills will perform better. Use the MCP docs server when you need its tools, e.g. the migration tool.

## Mastra skills [Direct link to Mastra skills](https://mastra.ai/docs/getting-started/build-with-ai\#mastra-skills "Direct link to Mastra skills")

Agent Skills are folders of instructions, scripts, and resources that agents can discover and use to do things more accurately and efficiently. Mastra skills contain setup instructions, best practices, CLI commands, and instructions on how to fetch up-to-date information from Mastra's documentation.

To install all available Mastra skills, run the following command:

- npm
- pnpm
- Yarn
- Bun

```bash
npx skills add mastra-ai/skills
```

```bash
pnpm dlx skills add mastra-ai/skills
```

```bash
yarn dlx skills add mastra-ai/skills
```

```bash
bun x skills add mastra-ai/skills
```

Mastra skills work with any coding agent that supports the [Skills standard](https://agentskills.io/), including Claude Code, Cursor, Codex, OpenCode, and others.

They're also available on [GitHub](https://github.com/mastra-ai/skills).

### Update skill [Direct link to Update skill](https://mastra.ai/docs/getting-started/build-with-ai\#update-skill "Direct link to Update skill")

To update to the latest version of the Mastra skill, run:

- npm
- pnpm
- Yarn
- Bun

```bash
npx skills update mastra
```

```bash
pnpm dlx skills update mastra
```

```bash
yarn dlx skills update mastra
```

```bash
bun x skills update mastra
```

## Mastra CLI [Direct link to Mastra CLI](https://mastra.ai/docs/getting-started/build-with-ai\#mastra-cli "Direct link to Mastra CLI")

The [Mastra CLI](https://mastra.ai/reference/cli/mastra) gives your coding agent a direct line to your Mastra runtime. Agents can invoke agents, run workflows, execute tools, inspect memory, run evals, and query traces and logs.

- npm
- pnpm
- Yarn
- Bun

```bash
npm install mastra@latest -g
```

```bash
pnpm add mastra@latest -g
```

```bash
yarn global add mastra@latest
```

```bash
bun add mastra@latest --global
```

For example, your coding agent can run an agent, then pull traces to inspect the results:

```bash
mastra api --url http://localhost:4111 agent run weather-agent '{"messages":"What is the weather in London?"}'
mastra api --url http://localhost:4111 trace list
```

Install the [Mastra skills](https://mastra.ai/docs/getting-started/build-with-ai#mastra-skills) to teach your agent how to use the CLI. See the [CLI commands reference](https://mastra.ai/reference/cli/mastra) for the full list of available commands.

## Embedded package docs [Direct link to Embedded package docs](https://mastra.ai/docs/getting-started/build-with-ai\#embedded-package-docs "Direct link to Embedded package docs")

Mastra packages ship with embedded documentation in `dist/docs`. When you install a Mastra package, your AI agent can read these files directly from `node_modules` to understand the package's APIs and patterns.

Each `dist/docs` includes:

- `SKILL.md`: A skill file following the skills standard
- `references/`: A folder with documentation files relevant to the package
- `assets/SOURCE_MAP.json`: A source map file linking public exports to their location in `node_modules`

## Context files [Direct link to Context files](https://mastra.ai/docs/getting-started/build-with-ai\#context-files "Direct link to Context files")

Mastra provides a root [`llms.txt`](https://mastra.ai/llms.txt) file that contains an overview of all available documentation pages. It doesn't provide an `llms-full.txt` file as it's not useful to have all documentation in one file.

Instead, each documentation page has its own `llms.txt` file. These files are streamlined markdown files. At the end of each docs page you'll find a link to the corresponding `llms.txt` file.

Add `/llms.txt` to any Mastra docs URL to access it. You can also request it by adding a `.md` extension to the end of the URL.

Examples for the [introduction page](https://mastra.ai/docs):

- [`/docs/llms.txt`](https://mastra.ai/docs/llms.txt)
- [`/docs.md`](https://mastra.ai/docs.md)

## Mastra's documentation [Direct link to Mastra's documentation](https://mastra.ai/docs/getting-started/build-with-ai\#mastras-documentation "Direct link to Mastra's documentation")

In addition to the [context files](https://mastra.ai/docs/getting-started/build-with-ai#context-files) each documentation page also features a "Copy markdown" button at the top of the page. It'll copy the streamlined markdown version to your clipboard. Beside it, you'll find a dropdown menu to open the page on GitHub, in ChatGPT, Claude, and others.

## MCP docs server [Direct link to MCP docs server](https://mastra.ai/docs/getting-started/build-with-ai\#mcp-docs-server "Direct link to MCP docs server")

The `@mastra/mcp-docs-server` package provides direct access to Mastra’s full documentation via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro). It works with Cursor, Windsurf, Cline, Claude Code, VS Code, Codex or any tool that supports MCP.

These tools are designed to help agents retrieve precise, task-specific information — whether you're adding a feature to an agent, scaffolding a new project, or exploring how something works.

In this guide you'll learn how to add Mastra's MCP server to your AI tooling.

### Installation [Direct link to Installation](https://mastra.ai/docs/getting-started/build-with-ai\#installation "Direct link to Installation")

#### create-mastra [Direct link to create-mastra](https://mastra.ai/docs/getting-started/build-with-ai\#create-mastra "Direct link to create-mastra")

During the interactive [create-mastra](https://mastra.ai/reference/cli/create-mastra) wizard, choose one of your tools in the MCP step.

#### Manual setup [Direct link to Manual setup](https://mastra.ai/docs/getting-started/build-with-ai\#manual-setup "Direct link to Manual setup")

If there are no specific instructions for your tool below, you may be able to add the MCP server with this common JSON configuration anyways.

mcp.json

```json
{
  "mcpServers": {
    "mastra": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mastra/mcp-docs-server@latest"]
    }
  }
}
```

#### Claude Code CLI [Direct link to Claude Code CLI](https://mastra.ai/docs/getting-started/build-with-ai\#claude-code-cli "Direct link to Claude Code CLI")

Install using the terminal command:

```bash
claude mcp add --scope project mastra -- npx -y @mastra/mcp-docs-server@latest
```

This creates a project-scoped `.mcp.json` file if one doesn't already exist. You can use the same command when using Claude Code as a [Visual Studio Code extension](https://code.claude.com/docs/en/vs-code#connect-to-external-tools-with-mcp).

[More info on using MCP servers with Claude Code](https://docs.claude.com/en/docs/claude-code/mcp)

#### OpenAI Codex CLI [Direct link to OpenAI Codex CLI](https://mastra.ai/docs/getting-started/build-with-ai\#openai-codex-cli "Direct link to OpenAI Codex CLI")

1. Register it from the terminal:





```bash
codex mcp add mastra-docs -- npx -y @mastra/mcp-docs-server@latest
```

2. Run `codex mcp list` to confirm the server shows as `enabled`.


[More info on using MCP servers with OpenAI Codex](https://developers.openai.com/codex/mcp)

#### Cursor [Direct link to Cursor](https://mastra.ai/docs/getting-started/build-with-ai\#cursor "Direct link to Cursor")

Install by selecting the button below:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-light.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=mastra&config=eyJjb21tYW5kIjoibnB4IC15IEBtYXN0cmEvbWNwLWRvY3Mtc2VydmVyIn0%3D)

If you followed the automatic installation, you'll see a popup when you open cursor in the bottom left corner to prompt you to enable the Mastra Docs MCP Server.

![Popup inside Cursor showing: &quot;New MCP server detected: mastra&quot;. The user can &quot;Skip&quot; or &quot;Enable&quot; it as an action.](https://mastra.ai/assets/images/enable-mastra-docs-cursor-cd5872abdc36c0e10951a59a47f25e12.png)

[More info on using MCP servers with Cursor](https://cursor.com/de/docs/context/mcp)

#### Antigravity [Direct link to Antigravity](https://mastra.ai/docs/getting-started/build-with-ai\#antigravity "Direct link to Antigravity")

Google Antigravity is an agent-first development platform that supports MCP servers for accessing external documentation, APIs, and project context.

1. Open your Antigravity MCP configuration file:


   - Click on **Agent session** and select the **“…” dropdown** at the top of the editor’s side panel, then select **MCP Servers** to access the **MCP Store**.
   - You can access it through the MCP Store interface in Antigravity

![The Antigravity MCP store. At the top is a search bar and below a list of available MCP servers. On the very top right is a dropdown menu.](https://mastra.ai/assets/images/antigravity_mcp_server-689ea495d9c7139cc431f1f1b9827f9b.png)

2. To add a custom MCP server, select **Manage MCP Servers** at the top of the MCP Store and select **View raw config** in the main tab.

![The Antigravity MCP store showing the Manage MCP Servers option and the View raw config button.](https://mastra.ai/assets/images/antigravity_managed_mcp-b661e8c04b3219000f8d842e5eb26a1a.png)

3. Add the Mastra MCP server configuration:





```json
{
     "mcpServers": {
       "mastra-docs": {
         "command": "npx",
         "args": ["-y", "@mastra/mcp-docs-server"]
       }
     }
}
```

4. Save the configuration and restart Antigravity

![The UI shows that the MCP server is enabled. You can also toggle individual tools.](https://mastra.ai/assets/images/antigravity_final_interface_mcp-7fa132dbe76cdee9f61136a26d6e6615.png)


Once configured, the Mastra MCP server exposes the following to Antigravity agents:

- Indexed documentation and API schemas for Mastra, enabling programmatic retrieval of relevant context during code generation
- Access to example code snippets and usage patterns stored in Mastra Docs
- Structured data for error handling and debugging references in the editor
- Metadata about current Mastra project patterns for code suggestion and completion

The MCP server will appear in Antigravity's MCP Store, where you can manage its connection status and authentication if needed.

[More info on using MCP servers with Antigravity](https://antigravity.google/)

#### Visual Studio Code [Direct link to Visual Studio Code](https://mastra.ai/docs/getting-started/build-with-ai\#visual-studio-code "Direct link to Visual Studio Code")

1. Create a `.vscode/mcp.json` file in your workspace

2. Insert the following configuration:



.vscode/mcp.json





```json
{
     "servers": {
       "mastra": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "@mastra/mcp-docs-server@latest"]
       }
     }
}
```


Once you installed the MCP server, you can use it like so:

1. Open VSCode settings.

2. Navigate to MCP settings.

3. Click "enable" on the Chat > MCP option.

![Entry in VSCode&#39;s settings page. The option is called &quot;Chat &gt; MCP: Enabled (Preview)&quot;. The description says: &quot;Enables integration with Model Context Protocol servers to provide additional tools and functionality.&quot;](https://mastra.ai/assets/images/vscode-mcp-setting-8d1eb4f3df1e33606503f8c5e937e9e3.png)


MCP only works in Agent mode in VSCode. Once you are in agent mode, open the `mcp.json` file and select the "start" button. Note that the "start" button will only appear if the `.vscode` folder containing `mcp.json` is in your workspace root, or the highest level of the in-editor file explorer.

![A screenshot of the mcp.json file showing the start button in the editor](https://mastra.ai/assets/images/vscode-start-mcp-26480d86080c4907cb497a325de106a4.png)

After starting the MCP server, select the tools button in the Copilot pane to see available tools.

![Tools page of VSCode to see available tools](https://mastra.ai/assets/images/vscode-mcp-running-d92d6ed234d1148093dc804b0ead3515.png)

[More info on using MCP servers with Visual Studio Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

#### Windsurf [Direct link to Windsurf](https://mastra.ai/docs/getting-started/build-with-ai\#windsurf "Direct link to Windsurf")

1. Open `~/.codeium/windsurf/mcp_config.json` in your editor

2. Insert the following configuration:



~/.codeium/windsurf/mcp\_config.json





```json
{
     "mcpServers": {
       "mastra": {
         "command": "npx",
         "args": ["-y", "@mastra/mcp-docs-server@latest"]
       }
     }
}
```

3. Save the configuration and restart Windsurf


[More info on using MCP servers with Windsurf](https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json)

#### OpenCode [Direct link to OpenCode](https://mastra.ai/docs/getting-started/build-with-ai\#opencode "Direct link to OpenCode")

You can define MCP servers in your [OpenCode configuration](https://opencode.ai/docs/config/) under `mcp`. Create an `opencode.jsonc` file in your project root with the following content:

opencode.jsonc

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mastra": {
      "type": "local",
      "command": ["npx", "-y", "@mastra/mcp-docs-server@latest"],
      "enabled": true
    }
  }
}
```

[More info on using MCP servers with OpenCode](https://opencode.ai/docs/mcp-servers)

#### Zed [Direct link to Zed](https://mastra.ai/docs/getting-started/build-with-ai\#zed "Direct link to Zed")

1. Open `~/.config/zed/settings.json` in your editor
2. Insert the following configuration:

~/.config/zed/settings.json

```json
{
  "context_servers": {
    "Mastra": {
      "command": "npx",
      "args": ["-y", "@mastra/mcp-docs-server@latest"]
    }
  }
}
```

### Usage [Direct link to Usage](https://mastra.ai/docs/getting-started/build-with-ai\#usage "Direct link to Usage")

Once configured, you can ask your AI tool questions about Mastra or instruct it to take actions. For these steps, it'll take the up-to-date information from Mastra's MCP server.

**Add features:**

- "Add evals to my agent and write tests"
- "Write me a workflow that does the following `[task]`"
- "Make a new tool that allows my agent to access `[3rd party API]`"

**Ask about integrations:**

- "Does Mastra work with the AI SDK?
How can I use it in my `[React/Svelte/etc]` project?"
- "Does Mastra support `[provider]` speech and voice APIs? Show me an example in my code of how I can use it."

**Debug or update existing code:**

- "I'm running into a bug with agent memory, have there been any related changes or bug fixes recently?"
- "How does working memory behave in Mastra and how can I use it to do `[task]`? It doesn't seem to work the way I expect."
- "I saw there are new workflow features, explain them to me and then update `[workflow]` to use them."

#### Troubleshooting [Direct link to Troubleshooting](https://mastra.ai/docs/getting-started/build-with-ai\#troubleshooting "Direct link to Troubleshooting")

1. **Server Not Starting**
   - Ensure [npx](https://docs.npmjs.com/cli/v11/commands/npx) is installed and working.
   - Check for conflicting MCP servers.
   - Verify your configuration file syntax.
2. **Tool Calls Failing**
   - Restart the MCP server and/or your IDE.
   - Update to the latest version of your IDE.

On this page

- [Mastra skills](https://mastra.ai/docs/getting-started/build-with-ai#mastra-skills)
  - [Update skill](https://mastra.ai/docs/getting-started/build-with-ai#update-skill)
- [Mastra CLI](https://mastra.ai/docs/getting-started/build-with-ai#mastra-cli)
- [Embedded package docs](https://mastra.ai/docs/getting-started/build-with-ai#embedded-package-docs)
- [Context files](https://mastra.ai/docs/getting-started/build-with-ai#context-files)
- [Mastra's documentation](https://mastra.ai/docs/getting-started/build-with-ai#mastras-documentation)
- [MCP docs server](https://mastra.ai/docs/getting-started/build-with-ai#mcp-docs-server)
  - [Installation](https://mastra.ai/docs/getting-started/build-with-ai#installation)
  - [Usage](https://mastra.ai/docs/getting-started/build-with-ai#usage)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**