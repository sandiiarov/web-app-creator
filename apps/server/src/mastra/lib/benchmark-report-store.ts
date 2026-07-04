import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(MODULE_DIR, '..', '..', '..', '.data')
const REPORTS_DIR = join(DATA_DIR, 'benchmark-reports')

export interface SavedBenchmarkReportMeta {
  bytes: number
  id: string
  path: string
  savedAt: string
}

export async function saveBenchmarkReport(
  report: Record<string, unknown>,
): Promise<SavedBenchmarkReportMeta> {
  const id = randomUUID()
  const savedAt = new Date().toISOString()
  const filePath = join(REPORTS_DIR, `${id}.json`)
  const payload = { id, report, savedAt }
  const json = `${JSON.stringify(payload, null, 2)}\n`

  await mkdir(REPORTS_DIR, { recursive: true })
  await writeFile(filePath, json, 'utf8')

  return {
    bytes: Buffer.byteLength(json, 'utf8'),
    id,
    path: filePath,
    savedAt,
  }
}
