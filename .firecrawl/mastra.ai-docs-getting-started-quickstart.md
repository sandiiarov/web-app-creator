[Skip to main content](https://mastra.ai/guides/getting-started/quickstart#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The `create mastra` CLI command is the quickest way to get started. It walks you through setup and creates example agents, workflows, and tools for you to run locally or adapt.

If you need more control over the setup, see the [manual installation guide](https://mastra.ai/docs/getting-started/manual-install). You can also use [`mastra init`](https://mastra.ai/reference/cli/mastra#mastra-init) for existing projects.

Use this pre-built prompt to get started faster.Copy prompt

Make new Mastra project. Mastra = framework for AI apps + agents on modern TypeScript stack. Before run command, ask these questions one by one. Wait for answers unless already given:

1. Project name? (default: "my-mastra-app")
2. Provider? (default: "openai", options: "openai", "anthropic", "groq", "google", "cerebras", "mistral")

Provider rules:

- Allowed provider -> use it.
- Any other value -> use "openai".

Run with answers: `npm create mastra@latest <project-name> --default --llm <provider>`

After project created, go to project dir. Start dev server: `npx bgproc start -n <project-name> -w -- npm run dev`

Start Mastra Studio at `http://localhost:4111`. Studio = UI for build, test, manage agents, workflows, tools.

Also tell: Mastra model router give 3000+ models from many providers: [https://mastra.ai/models](https://mastra.ai/models)

## Before you begin [Direct link to Before you begin](https://mastra.ai/guides/getting-started/quickstart\#before-you-begin "Direct link to Before you begin")

- You'll need an API key from a supported [model provider](https://mastra.ai/models). If you don't have a preference, use [OpenAI](https://mastra.ai/models/providers/openai).

## Initialize Mastra [Direct link to Initialize Mastra](https://mastra.ai/guides/getting-started/quickstart\#initialize-mastra "Direct link to Initialize Mastra")

You can run `create mastra` anywhere on your machine. Start the setup wizard:

- npm
- pnpm
- Yarn
- Bun

```bash
npm create mastra@latest
```

```bash
pnpm create mastra
```

```bash
yarn create mastra
```

```bash
bunx create-mastra
```

You'll be prompted for various configuration options, including your LLM provider and whether to enable [Observability](https://mastra.ai/docs/mastra-platform/observability) on the Mastra platform.

The wizard creates a new directory for your project with a `src/mastra` folder containing an example weather agent and the following files:

- `index.ts`: Entry point for all Mastra-related code and configuration
- `agents/weather-agent.ts`: A weather agent with a prompt that uses the tool
- `tools/weather-tool.ts`: A tool to fetch weather for a given location
- `workflows/weather-workflow.ts`: A workflow that runs the weather agent
- `scorers/weather-scorer.ts`: A scorer to evaluate the weather agent's responses

Depending on your choices, you'll also end up with [Mastra Skills](https://mastra.ai/docs/getting-started/build-with-ai#mastra-skills) or the [MCP Docs Server](https://mastra.ai/docs/getting-started/build-with-ai#mcp-docs-server) installed.

tip

You can use [flags](https://mastra.ai/reference/cli/create-mastra#cli-flags) with `create mastra` like `--no-example` to skip the example weather agent or `--template` to start from a specific [template](https://mastra.ai/templates).

## Test your agent [Direct link to Test your agent](https://mastra.ai/guides/getting-started/quickstart\#test-your-agent "Direct link to Test your agent")

Once setup is complete, follow the instructions in your terminal to start the Mastra dev server, then open Studio at [localhost:4111](http://localhost:4111/).

Try asking about the weather. If your API key is set up correctly, you'll get a response:

Your browser does not support the video tag.

[Studio](https://mastra.ai/docs/studio/overview) lets you rapidly build and prototype agents without needing to build a UI. Once you're ready, you can integrate your Mastra agent into your app using the guides below.

## Next steps [Direct link to Next steps](https://mastra.ai/guides/getting-started/quickstart\#next-steps "Direct link to Next steps")

- Integrate Mastra with your frontend framework: [Next.js](https://mastra.ai/guides/getting-started/next-js), [React](https://mastra.ai/guides/getting-started/vite-react), or [Astro](https://mastra.ai/guides/getting-started/astro)
- Read more about [Mastra's features](https://mastra.ai/docs#what-you-can-build)
- Learn how you can [build Mastra with AI](https://mastra.ai/docs/getting-started/build-with-ai)
- Build an agent from scratch following one of our [guides](https://mastra.ai/guides)
- Watch conceptual guides on our [YouTube channel](https://www.youtube.com/@mastra-ai) and [subscribe](https://www.youtube.com/@mastra-ai?sub_confirmation=1)

On this page

- [Before you begin](https://mastra.ai/guides/getting-started/quickstart#before-you-begin)
- [Initialize Mastra](https://mastra.ai/guides/getting-started/quickstart#initialize-mastra)
- [Test your agent](https://mastra.ai/guides/getting-started/quickstart#test-your-agent)
- [Next steps](https://mastra.ai/guides/getting-started/quickstart#next-steps)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**