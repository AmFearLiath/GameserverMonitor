import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../src/services/auth.service.js';

describe('authService.login', () => {
  it('returns token payload for valid credentials', async () => {
    const authService = createAuthService({
      findByUsername: vi.fn(async () => ({
        id: 'user-1',
        username: 'admin',
        password_hash: 'hash',
        is_enabled: true,
        roles: ['ADMIN']
      })),
      comparePassword: vi.fn(async () => true),
      signToken: vi.fn(() => 'signed-token'),
      accessTokenExpiresInSeconds: 3600
    });

    const result = await authService.login('admin', 'admin1234');

    expect(result.access_token).toBe('signed-token');
    expect(result.expires_in).toBe(3600);
    expect(result.refresh_token).toBeNull();
    expect(result.user.username).toBe('admin');
    expect(result.user.roles).toEqual(['ADMIN']);
  });

  it('throws unauthorized for invalid credentials', async () => {
    const authService = createAuthService({
      findByUsername: vi.fn(async () => ({
        id: 'user-1',
        username: 'admin',
        password_hash: 'hash',
        is_enabled: true,
        roles: ['ADMIN']
      })),
      comparePassword: vi.fn(async () => false),
      signToken: vi.fn(() => 'signed-token'),
      accessTokenExpiresInSeconds: 3600
    });

    await expect(authService.login('admin', 'wrong')).rejects.toMatchObject({
      code: 'API_UNAUTHORIZED',
      status: 401
    });
  });

  it('throws validation error for missing credentials', async () => {
    const authService = createAuthService({
      findByUsername: vi.fn(async () => null),
      comparePassword: vi.fn(async () => false),
      signToken: vi.fn(() => 'signed-token'),
      accessTokenExpiresInSeconds: 3600
    });

    await expect(authService.login('', '')).rejects.toMatchObject({
      code: 'API_VALIDATION_ERROR',
      status: 400
    });
  });
});
