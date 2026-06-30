[Skip to main content](https://mastra.ai/docs/getting-started/project-structure#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

Your new Mastra project, created with the `create mastra` command, comes with a predefined set of files and folders to help you get started.

Mastra is a framework, but it's **unopinionated** about how you organize or colocate your files. The CLI provides a sensible default structure that works well for most projects, but you're free to adapt it to your workflow or team conventions. You could even build your entire project in a single file if you wanted! Whatever structure you choose, keep it consistent to ensure your code stays maintainable and straightforward to navigate.

## Default project structure [Direct link to Default project structure](https://mastra.ai/docs/getting-started/project-structure\#default-project-structure "Direct link to Default project structure")

A project created with the `create mastra` command looks like this:

```text
src/
├── mastra/
│   ├── agents/
│   │   └── weather-agent.ts
│   ├── tools/
│   │   └── weather-tool.ts
│   ├── workflows/
│   │   └── weather-workflow.ts
│   ├── scorers/
│   │   └── weather-scorer.ts
│   └── index.ts
├── .env.example
├── package.json
└── tsconfig.json
```

tip

Use the predefined files as templates. Duplicate and adapt them to quickly create your own agents, tools, workflows, etc.

### Folders [Direct link to Folders](https://mastra.ai/docs/getting-started/project-structure\#folders "Direct link to Folders")

Folders organize your agent's resources, like agents, tools, and workflows.

| Folder | Description |
| --- | --- |
| `src/mastra` | Entry point for all Mastra-related code and configuration. |
| `src/mastra/agents` | Define and configure your agents - their behavior, goals, and tools. |
| `src/mastra/workflows` | Define multi-step workflows that orchestrate agents and tools together. |
| `src/mastra/tools` | Create reusable tools that your agents can call |
| `src/mastra/mcp` | (Optional) Implement custom MCP servers to share your tools with external agents |
| `src/mastra/scorers` | (Optional) Define scorers for evaluating agent performance over time |
| `src/mastra/public` | (Optional) Contents are copied into the `.build/output` directory during the build process, making them available for serving at runtime |

### Top-level files [Direct link to Top-level files](https://mastra.ai/docs/getting-started/project-structure\#top-level-files "Direct link to Top-level files")

Top-level files define how your Mastra project is configured, built, and connected to its environment.

| File | Description |
| --- | --- |
| `src/mastra/index.ts` | Central entry point where you configure and initialize Mastra. |
| `.env.example` | Template for environment variables - copy and rename to `.env` to add your secret [model provider](https://mastra.ai/models) keys. |
| `package.json` | Defines project metadata, dependencies, and available npm scripts. |
| `tsconfig.json` | Configures TypeScript options such as path aliases, compiler settings, and build output. |

## Next steps [Direct link to Next steps](https://mastra.ai/docs/getting-started/project-structure\#next-steps "Direct link to Next steps")

- Read more about [Mastra's features](https://mastra.ai/docs#what-you-can-build).
- Integrate Mastra with your frontend framework: [Next.js](https://mastra.ai/guides/getting-started/next-js), [React](https://mastra.ai/guides/getting-started/vite-react), or [Astro](https://mastra.ai/guides/getting-started/astro).
- Build an agent from scratch following one of our [guides](https://mastra.ai/guides).
- Watch conceptual guides on our [YouTube channel](https://www.youtube.com/@mastra-ai) and [subscribe](https://www.youtube.com/@mastra-ai?sub_confirmation=1)!

On this page

- [Default project structure](https://mastra.ai/docs/getting-started/project-structure#default-project-structure)
  - [Folders](https://mastra.ai/docs/getting-started/project-structure#folders)
  - [Top-level files](https://mastra.ai/docs/getting-started/project-structure#top-level-files)
- [Next steps](https://mastra.ai/docs/getting-started/project-structure#next-steps)

Mastra Newsletter

SubscribeShare feedback