import { createOxfmtConfig } from '@workspace/oxfmt-config'

export default createOxfmtConfig({
  ignorePatterns: ['.mastra/**', 'sandbox/skills/**'],
})
