/** Runtime-owned, bounded buffer store for generated images. */
import { randomUUID } from 'node:crypto'

export const IMAGE_ID_SOURCE =
  'img-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\\d+)'

export interface ImageStore {
  clear(): void
  getImage(id: string): StoredImage | undefined
  releaseImage(id: string): boolean
  saveImage(buffer: Buffer, mediaType: string): string
}

export interface StoredImage {
  buffer: Buffer
  createdAt: number
  extension: string
  mediaType: string
}

export class ImageStoreCapacityError extends Error {
  constructor() {
    super('Generated image buffer capacity is exhausted.')
    this.name = 'ImageStoreCapacityError'
  }
}

export class ImageStoreIdCollisionError extends Error {
  constructor() {
    super('Could not allocate a unique generated image id.')
    this.name = 'ImageStoreIdCollisionError'
  }
}

export function createImageStore({
  createId = randomUUID,
  maxBytes = 256 * 1024 * 1024,
  maxImages = 128,
}: {
  createId?: () => string
  maxBytes?: number
  maxImages?: number
} = {}): ImageStore {
  const images = new Map<string, StoredImage>()
  const allocatedIds = new Set<string>()
  let storedBytes = 0

  function getImage(id: string): StoredImage | undefined {
    return images.get(id)
  }

  function releaseImage(id: string): boolean {
    const image = images.get(id)
    if (!image) return false
    storedBytes -= image.buffer.byteLength
    return images.delete(id)
  }

  function saveImage(buffer: Buffer, mediaType: string): string {
    if (
      images.size >= maxImages ||
      storedBytes + buffer.byteLength > maxBytes
    ) {
      throw new ImageStoreCapacityError()
    }
    let id: string | undefined
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = `img-${createId()}`
      if (!allocatedIds.has(candidate)) {
        id = candidate
        break
      }
    }
    if (!id) throw new ImageStoreIdCollisionError()
    const ownedBuffer = Buffer.from(buffer)
    images.set(id, {
      buffer: ownedBuffer,
      createdAt: Date.now(),
      extension: extensionFor(mediaType),
      mediaType,
    })
    allocatedIds.add(id)
    storedBytes += ownedBuffer.byteLength
    return id
  }

  return {
    clear() {
      images.clear()
      allocatedIds.clear()
      storedBytes = 0
    },
    getImage,
    releaseImage,
    saveImage,
  }
}

function extensionFor(mediaType: string): string {
  if (mediaType === 'image/svg+xml') return 'svg'
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  return 'png'
}
