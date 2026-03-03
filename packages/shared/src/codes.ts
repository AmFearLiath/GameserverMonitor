export const apiErrorMessageKeyByCode: Record<string, string> = {
  API_UNAUTHORIZED: 'error.api_unauthorized',
  API_FORBIDDEN: 'error.api_forbidden',
  API_VALIDATION_ERROR: 'error.api_validation_error',
  API_NOT_FOUND: 'error.api_not_found',
  API_CONFLICT: 'error.api_conflict',
  API_RATE_LIMITED: 'error.api_rate_limited',
  API_INTERNAL_ERROR: 'error.api_internal_error',
  API_PRECONDITION_FAILED: 'error.api_precondition_failed',
  API_SERVICE_UNAVAILABLE: 'error.api_service_unavailable',
  API_UPSTREAM_UNAUTHORIZED: 'error.api_upstream_unauthorized',
  API_UPSTREAM_FORBIDDEN: 'error.api_upstream_forbidden',
  API_UPSTREAM_UNREACHABLE: 'error.api_upstream_unreachable',
  API_UPSTREAM_TIMEOUT: 'error.api_upstream_timeout'
};
