import { describe, expect, it } from 'vitest'

import {
  createImageStore,
  ImageStoreCapacityError,
  ImageStoreIdCollisionError,
} from './image-store.ts'

describe('runtime image store', () => {
  it('allocates UUID identities, including UUIDs that begin with digits', () => {
    const store = createImageStore({
      createId: () => '12345678-1234-4abc-8def-123456789abc',
    })

    expect(store.saveImage(Buffer.from('image'), 'image/png')).toBe(
      'img-12345678-1234-4abc-8def-123456789abc',
    )
  })

  it('rejects capacity instead of evicting a buffer needed for persistence', () => {
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]
    const store = createImageStore({
      createId: () => ids.shift()!,
      maxBytes: 4,
      maxImages: 1,
    })
    const first = store.saveImage(Buffer.from('1234'), 'image/png')

    expect(() => store.saveImage(Buffer.from('x'), 'image/png')).toThrow(
      ImageStoreCapacityError,
    )
    expect(store.getImage(first)?.buffer).toEqual(Buffer.from('1234'))
    expect(store.releaseImage(first)).toBe(true)
    expect(store.saveImage(Buffer.from('x'), 'image/png')).toBe(
      'img-00000000-0000-4000-8000-000000000002',
    )
  })

  it('never reuses an allocated identity until the store is disposed', () => {
    const store = createImageStore({
      createId: () => '00000000-0000-4000-8000-000000000001',
    })
    const id = store.saveImage(Buffer.from('first'), 'image/png')
    store.releaseImage(id)

    expect(() => store.saveImage(Buffer.from('second'), 'image/png')).toThrow(
      ImageStoreIdCollisionError,
    )
    store.clear()
    expect(store.saveImage(Buffer.from('after-dispose'), 'image/png')).toBe(id)
  })
})
