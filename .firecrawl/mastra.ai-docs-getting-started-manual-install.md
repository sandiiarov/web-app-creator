[Skip to main content](https://mastra.ai/docs/getting-started/manual-install#__docusaurus_skipToContent_fallback)

Copy markdown

info

Use this guide to manually build a standalone Mastra server step by step. In most cases, it's quicker to follow the [quickstart guide](https://mastra.ai/guides/getting-started/quickstart), which achieves the same result using the [`mastra create`](https://mastra.ai/reference/cli/create-mastra) command. For existing projects, you can also use [`mastra init`](https://mastra.ai/reference/cli/mastra#mastra-init).

If you prefer not to use our automatic CLI tool, you can set up your project yourself by following the guide below.

1. Create a new project and change directory:





```bash
mkdir my-first-agent && cd my-first-agent
```









Generate a new `package.json` file:



   - npm
   - pnpm
   - Yarn
   - Bun

```bash
npm init
```

```bash
pnpm init
```

```bash
yarn init
```

```bash
bun init
```

Install the following dependencies:

   - npm
   - pnpm
   - Yarn
   - Bun

```bash
npm install -D typescript @types/node mastra@latest
npm install @mastra/core@latest zod@^4
```

```bash
pnpm add -D typescript @types/node mastra@latest
pnpm add @mastra/core@latest zod@^4
```

```bash
yarn add --dev typescript @types/node mastra@latest
yarn add @mastra/core@latest zod@^4
```

```bash
bun add --dev typescript @types/node mastra@latest
bun add @mastra/core@latest zod@^4
```

Add `dev` and `build` scripts to your `package.json` file:

package.json

```json
{
  "scripts": {
    "dev": "mastra dev",
    "build": "mastra build"
  }
}
```

2. Create a `tsconfig.json` file:





```bash
touch tsconfig.json
```









Add the following configuration:



tsconfig.json





```json
{
     "compilerOptions": {
       "target": "ES2022",
       "module": "ES2022",
       "moduleResolution": "bundler",
       "esModuleInterop": true,
       "forceConsistentCasingInFileNames": true,
       "strict": true,
       "skipLibCheck": true,
       "noEmit": true,
       "outDir": "dist"
     },
     "include": ["src/**/*"]
}
```











info





Mastra requires modern `module` and `moduleResolution` settings. Using `CommonJS` or `node` will cause resolution errors.

3. Create an `.env` file:





```bash
touch .env
```









Add your API key:



.env





```bash
GOOGLE_API_KEY=<your-api-key>
```











note





This guide uses Google Gemini, but you can use any supported [model provider](https://mastra.ai/models), including OpenAI, Anthropic, and more.

4. Create a `weather-tool.ts` file:





```bash
mkdir -p src/mastra/tools && touch src/mastra/tools/weather-tool.ts
```









Add the following code:



src/mastra/tools/weather-tool.ts





```ts
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const weatherTool = createTool({
     id: 'get-weather',
     description: 'Get current weather for a location',
     inputSchema: z.object({
       location: z.string().describe('City name'),
     }),
     outputSchema: z.object({
       output: z.string(),
     }),
     execute: async () => {
       return {
         output: 'The weather is sunny',
       }
     },
})
```











info





We've shortened and simplified the `weatherTool` example here. You can see the complete weather tool under [Giving an Agent a Tool](https://mastra.ai/docs/agents/using-tools).

5. Create a `weather-agent.ts` file:





```bash
mkdir -p src/mastra/agents && touch src/mastra/agents/weather-agent.ts
```









Add the following code:



src/mastra/agents/weather-agent.ts





```ts
import { Agent } from '@mastra/core/agent'
import { weatherTool } from '../tools/weather-tool'

export const weatherAgent = new Agent({
     id: 'weather-agent',
     name: 'Weather Agent',
     instructions: `
         You are a helpful weather assistant that provides accurate weather information.

         Your primary function is to help users get weather details for specific locations. When responding:
      - Always ask for a location if none is provided
      - If the location name isn't in English, please translate it
      - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
      - Include relevant details like humidity, wind conditions, and precipitation
      - Keep responses concise but informative

      Use the weatherTool to fetch current weather data.
`,
model: 'google/gemini-2.5-pro',
tools: { weatherTool },
})
```

6. Create the Mastra entry point and register your agent:





```bash
touch src/mastra/index.ts
```









Add the following code:



src/mastra/index.ts





```ts
import { Mastra } from '@mastra/core'
import { weatherAgent } from './agents/weather-agent'

export const mastra = new Mastra({
     agents: { weatherAgent },
})
```

7. You can now launch [Studio](https://mastra.ai/docs/studio/overview) and test your agent.



   - npm
   - pnpm
   - Yarn
   - Bun

```bash
npm run dev
```

```bash
pnpm run dev
```

```bash
yarn dev
```

```bash
bun run dev
```

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**