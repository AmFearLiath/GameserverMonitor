import type { ServerStatus } from '@gm/shared';

export type StatusMachineInput = {
  is_enabled: boolean;
  maintenance_mode: boolean;
  ptero_raw_state: string;
  ptero_data_stale: boolean;
  primary_ok: boolean | null;
  confirm_state: 'NOT_APPLICABLE' | 'CONFIRMED_OK' | 'CONFIRMED_FAIL';
};

export type StatusMachineResult = {
  normalized_status: ServerStatus;
  last_reason_code: string;
};

const transitionStates = new Set(['starting', 'stopping', 'installing']);

export const computeStatus = (input: StatusMachineInput): StatusMachineResult => {
  if (!input.is_enabled) {
    return { normalized_status: 'TRANSITION', last_reason_code: 'STATUS_SERVER_DISABLED' };
  }

  if (input.maintenance_mode) {
    return { normalized_status: 'MAINTENANCE', last_reason_code: 'STATUS_MAINTENANCE_MODE' };
  }

  if (input.ptero_data_stale) {
    return { normalized_status: 'TRANSITION', last_reason_code: 'STATUS_PTERO_DATA_STALE' };
  }

  if (input.ptero_raw_state !== 'running') {
    if (transitionStates.has(input.ptero_raw_state)) {
      return { normalized_status: 'TRANSITION', last_reason_code: 'STATUS_PTERO_TRANSITION' };
    }

    return { normalized_status: 'OFFLINE', last_reason_code: 'STATUS_PTERO_NOT_RUNNING' };
  }

  if (input.primary_ok === true) {
    return { normalized_status: 'ONLINE', last_reason_code: 'STATUS_QUERY_OK' };
  }

  if (input.primary_ok === false && input.confirm_state === 'CONFIRMED_FAIL') {
    return { normalized_status: 'OFFLINE', last_reason_code: 'STATUS_QUERY_FAIL_CONFIRMED' };
  }

  if (input.primary_ok === false && input.confirm_state === 'CONFIRMED_OK') {
    return { normalized_status: 'ONLINE', last_reason_code: 'STATUS_TRANSIENT_QUERY_FAIL' };
  }

  return { normalized_status: 'TRANSITION', last_reason_code: 'STATUS_NO_ENDPOINT' };
};
