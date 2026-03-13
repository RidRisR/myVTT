import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Use a temp directory for test data to avoid polluting real data
const TEST_DATA_DIR = path.join(os.tmpdir(), `myvtt-test-${Date.now()}`)
process.env.DATA_DIR = TEST_DATA_DIR

// Import app after setting DATA_DIR
const { app } = await import('../../server/app.mjs')

afterAll(() => {
  // Clean up test data directory
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  }
})

// ── C1: Room ID path traversal validation ──
describe('roomId validation (path traversal prevention)', () => {
  it('rejects roomId with path traversal characters', async () => {
    // Express normalizes ../../ in URL paths, so we test the param value directly
    // by URL-encoding dots: %2E%2E becomes ".." in the param
    const res = await request(app).get('/api/rooms/%2E%2E%2F%2E%2E%2Fetc/assets')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid room ID')
  })

  it('rejects roomId with encoded slashes', async () => {
    const res = await request(app).get('/api/rooms/foo%2Fbar/assets')
    expect(res.status).toBe(400)
  })

  it('rejects roomId with spaces', async () => {
    const res = await request(app).get('/api/rooms/foo%20bar/assets')
    expect(res.status).toBe(400)
  })

  it('accepts valid roomId (alphanumeric + dash + underscore)', async () => {
    const res = await request(app).get('/api/rooms/abc-123_xyz/assets')
    // Should not be 400 (might be 500 if DB not ready, but not validation error)
    expect(res.status).not.toBe(400)
  })
})

// ── I7: File type filtering ──
describe('file upload MIME type filtering', () => {
  let testRoomId

  beforeAll(async () => {
    // Create a test room
    const res = await request(app).post('/api/rooms').send({ name: 'Upload Test Room' })
    testRoomId = res.body.id
  })

  it('accepts image uploads', async () => {
    const res = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', Buffer.from('fake-png-data'), {
        filename: 'test.png',
        contentType: 'image/png',
      })
    expect(res.status).toBe(200)
    expect(res.body.url).toContain('/uploads/')
  })

  it('accepts video uploads', async () => {
    const res = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', Buffer.from('fake-video-data'), {
        filename: 'test.mp4',
        contentType: 'video/mp4',
      })
    expect(res.status).toBe(200)
  })

  it('accepts audio uploads', async () => {
    const res = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', Buffer.from('fake-audio-data'), {
        filename: 'test.mp3',
        contentType: 'audio/mpeg',
      })
    expect(res.status).toBe(200)
  })

  it('uploaded file can be served back via GET', async () => {
    const content = Buffer.from('serve-test-image-data')
    const uploadRes = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', content, {
        filename: 'serve-test.png',
        contentType: 'image/png',
      })
    expect(uploadRes.status).toBe(200)

    // GET the uploaded file — must return 200 with matching content
    const serveRes = await request(app).get(uploadRes.body.url)
    expect(serveRes.status).toBe(200)
    expect(Buffer.from(serveRes.body).equals(content)).toBe(true)
  })

  it('rejects non-media file uploads', async () => {
    const res = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', Buffer.from('MZ-fake-exe'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      })
    // multer fileFilter with cb(null, false) returns 400 with 'No file found'
    expect(res.status).toBe(400)
  })
})

// ── C2: Asset DELETE cleans up disk file ──
describe('asset deletion cleans up disk files', () => {
  let testRoomId

  beforeAll(async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Delete Test Room' })
    testRoomId = res.body.id
  })

  it('deletes the disk file when deleting an asset', async () => {
    // 1. Upload a file
    const uploadRes = await request(app)
      .post(`/api/rooms/${testRoomId}/upload`)
      .attach('file', Buffer.from('test-image-data'), {
        filename: 'delete-me.png',
        contentType: 'image/png',
      })
    const fileUrl = uploadRes.body.url
    expect(fileUrl).toBeTruthy()

    // Extract filename from URL to check disk
    const filename = fileUrl.split('/').pop()
    const filePath = path.join(TEST_DATA_DIR, 'rooms', testRoomId, 'uploads', filename)
    expect(fs.existsSync(filePath)).toBe(true)

    // 2. Create an asset referencing that file
    const assetRes = await request(app)
      .post(`/api/rooms/${testRoomId}/assets`)
      .send({ url: fileUrl, name: 'test-asset', type: 'image' })
    const assetId = assetRes.body.id

    // 3. Delete the asset
    const deleteRes = await request(app).delete(`/api/rooms/${testRoomId}/assets/${assetId}`)
    expect(deleteRes.status).toBe(200)

    // 4. Verify file is gone from disk
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('handles gracefully when disk file is already missing', async () => {
    // Create an asset with a non-existent file URL
    const assetRes = await request(app)
      .post(`/api/rooms/${testRoomId}/assets`)
      .send({ url: `/api/rooms/${testRoomId}/uploads/nonexistent.png`, type: 'image' })
    const assetId = assetRes.body.id

    // Delete should succeed even though file doesn't exist
    const deleteRes = await request(app).delete(`/api/rooms/${testRoomId}/assets/${assetId}`)
    expect(deleteRes.status).toBe(200)
  })

  it('returns 404 for non-existent asset', async () => {
    const res = await request(app).delete(`/api/rooms/${testRoomId}/assets/nonexistent-id`)
    expect(res.status).toBe(404)
  })
})
