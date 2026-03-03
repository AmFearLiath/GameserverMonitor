import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { config } from '@gm/config';
import { createApp } from '../src/app.js';

describe('GET /api/v1/auth/me', () => {
  it('returns unauthorized when token is missing', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('API_UNAUTHORIZED');
    expect(response.body.error.message_key).toBe('error.api_unauthorized');
  });

  it('returns authenticated user for valid bearer token', async () => {
    const app = createApp();
    const accessToken = jwt.sign(
      {
        sub: 'user-123',
        username: 'admin',
        roles: ['ADMIN']
      },
      config.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '1h'
      }
    );

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-123',
      username: 'admin',
      roles: ['ADMIN']
    });
  });
});
