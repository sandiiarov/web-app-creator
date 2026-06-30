import { mastra } from './src/mastra/index.ts'

const storage = mastra.getStorage()
const observability = mastra.observability

console.log('boot: ok')
console.log('storage.id:', storage?.id ?? '(none)')
console.log('storage.default:', storage?.default?.constructor?.name ?? '(none)')
console.log(
  'storage.observability:',
  storage?.observability?.constructor?.name ?? '(none)',
)
console.log(
  'observability entrypoint:',
  observability?.constructor?.name ?? '(none)',
)
console.log(
  'MASTRA_PLATFORM_ACCESS_TOKEN set:',
  Boolean(process.env.MASTRA_PLATFORM_ACCESS_TOKEN),
)
console.log('MASTRA_PROJECT_ID set:', Boolean(process.env.MASTRA_PROJECT_ID))
