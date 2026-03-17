// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isVideoUrl, getMediaDimensions } from '../assetUpload'

// ── isVideoUrl ──

describe('isVideoUrl', () => {
  it('returns true for video extensions', () => {
    expect(isVideoUrl('/scene.mp4')).toBe(true)
    expect(isVideoUrl('/scene.webm')).toBe(true)
    expect(isVideoUrl('/scene.mov')).toBe(true)
    expect(isVideoUrl('/scene.ogv')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isVideoUrl('/scene.MP4')).toBe(true)
  })

  it('returns false for image extensions', () => {
    expect(isVideoUrl('/scene.png')).toBe(false)
    expect(isVideoUrl('/scene.jpg')).toBe(false)
    expect(isVideoUrl('/scene.webp')).toBe(false)
  })
})

// ── getMediaDimensions ──

describe('getMediaDimensions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves with image dimensions on successful load', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 800
        naturalHeight = 600
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      },
    )

    const dims = await getMediaDimensions('/test.png')
    expect(dims).toEqual({ w: 800, h: 600 })
  })

  it('resolves with 1920x1080 fallback on image load error', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 0
        naturalHeight = 0
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {
          setTimeout(() => this.onerror?.(), 0)
        }
      },
    )

    const dims = await getMediaDimensions('/broken.png')
    expect(dims).toEqual({ w: 1920, h: 1080 })
  })

  it('uses video element for video URLs', async () => {
    const mockVideo = {
      videoWidth: 1280,
      videoHeight: 720,
      preload: '',
      onloadedmetadata: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: '',
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        setTimeout(() => mockVideo.onloadedmetadata?.(), 0)
        return mockVideo as unknown as HTMLVideoElement
      }
      return document.createElement(tag)
    })

    const dims = await getMediaDimensions('/clip.mp4')
    expect(dims).toEqual({ w: 1280, h: 720 })
  })

  it('resolves with 1920x1080 fallback on video load error', async () => {
    const mockVideo = {
      videoWidth: 0,
      videoHeight: 0,
      preload: '',
      onloadedmetadata: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: '',
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        setTimeout(() => mockVideo.onerror?.(), 0)
        return mockVideo as unknown as HTMLVideoElement
      }
      return document.createElement(tag)
    })

    const dims = await getMediaDimensions('/broken.webm')
    expect(dims).toEqual({ w: 1920, h: 1080 })
  })
})
