import { describe, expect, it } from 'vitest';
import { computeStatus } from '../src/status-machine.js';

describe('computeStatus', () => {
  it('returns maintenance when maintenance mode is active', () => {
    const result = computeStatus({
      is_enabled: true,
      maintenance_mode: true,
      ptero_raw_state: 'running',
      ptero_data_stale: false,
      primary_ok: true,
      confirm_state: 'NOT_APPLICABLE'
    });

    expect(result.normalized_status).toBe('MAINTENANCE');
    expect(result.last_reason_code).toBe('STATUS_MAINTENANCE_MODE');
  });

  it('returns offline on confirmed query failure', () => {
    const result = computeStatus({
      is_enabled: true,
      maintenance_mode: false,
      ptero_raw_state: 'running',
      ptero_data_stale: false,
      primary_ok: false,
      confirm_state: 'CONFIRMED_FAIL'
    });

    expect(result.normalized_status).toBe('OFFLINE');
    expect(result.last_reason_code).toBe('STATUS_QUERY_FAIL_CONFIRMED');
  });
});
