export type AdapterResult = {
  ok: boolean;
  reason_code: string;
  reason_source: 'ADAPTER';
  rtt_ms: number | null;
  observations: Record<string, unknown>;
  raw: Record<string, unknown> | null;
};
