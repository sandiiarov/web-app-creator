import type { IncomingMessage } from 'node:http'

export class RequestBodyTooLargeError extends Error {
  readonly maxBytes: number

  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit`)
    this.name = 'RequestBodyTooLargeError'
    this.maxBytes = maxBytes
  }
}

export async function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('maxBytes must be a positive integer')
  }

  const contentLength = request.headers['content-length']
  if (
    typeof contentLength === 'string' &&
    /^\d+$/.test(contentLength) &&
    BigInt(contentLength) > BigInt(maxBytes)
  ) {
    request.resume()
    throw new RequestBodyTooLargeError(maxBytes)
  }

  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    totalBytes += buffer.length

    if (totalBytes > maxBytes) {
      request.resume()
      throw new RequestBodyTooLargeError(maxBytes)
    }

    chunks.push(buffer)
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8')
}
