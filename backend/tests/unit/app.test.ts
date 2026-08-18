import request from 'supertest'
import { describe, expect, it } from 'vitest'
import app from '../../src/app'

describe('HTTP application hardening', () => {
  it('serves liveness with safe response headers', async () => {
    const response = await request(app).get('/live')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('alive')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
    expect(response.headers['permissions-policy']).toContain('camera=()')
    expect(response.headers['strict-transport-security']).toBeUndefined()
  })
})
