import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALERT_SECRET_PREFIX = 'gmse:v1:';

type AlertSecretEnvelope = {
  v: 1;
  alg: 'aes-256-gcm';
  kid: string;
  iv: string;
  tag: string;
  data: string;
};

const toAesKey = (masterKey: string): Buffer => {
  return createHash('sha256').update(masterKey, 'utf8').digest();
};

const toBase64 = (value: Buffer): string => value.toString('base64');

const fromBase64 = (value: string): Buffer => Buffer.from(value, 'base64');

export const parseAlertMasterKeyring = (raw: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [kid, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof kid !== 'string' || kid.trim().length === 0) {
        continue;
      }

      if (typeof value !== 'string' || value.trim().length < 16) {
        continue;
      }

      result[kid.trim()] = value;
    }

    return result;
  } catch {
    return {};
  }
};

export const encryptAlertConfig = (payload: Record<string, unknown>, kid: string, masterKey: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', toAesKey(masterKey), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: AlertSecretEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    kid,
    iv: toBase64(iv),
    tag: toBase64(tag),
    data: toBase64(encrypted)
  };

  return `${ALERT_SECRET_PREFIX}${toBase64(Buffer.from(JSON.stringify(envelope), 'utf8'))}`;
};

export const decryptAlertConfig = (
  configEnc: string,
  configKid: string,
  keyring: Record<string, string>
): Record<string, unknown> | null => {
  const raw = configEnc.trim();
  if (raw.length === 0) {
    return null;
  }

  if (!raw.startsWith(ALERT_SECRET_PREFIX)) {
    if (/^https?:\/\//i.test(raw)) {
      return { webhook_url: raw };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const encodedEnvelope = raw.slice(ALERT_SECRET_PREFIX.length);
  let envelope: AlertSecretEnvelope;

  try {
    envelope = JSON.parse(fromBase64(encodedEnvelope).toString('utf8')) as AlertSecretEnvelope;
  } catch {
    return null;
  }

  if (envelope.v !== 1 || envelope.alg !== 'aes-256-gcm') {
    return null;
  }

  const resolvedKid = typeof envelope.kid === 'string' && envelope.kid.length > 0 ? envelope.kid : configKid;
  const masterKey = keyring[resolvedKid] ?? keyring[configKid];
  if (!masterKey) {
    return null;
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', toAesKey(masterKey), fromBase64(envelope.iv));
    decipher.setAuthTag(fromBase64(envelope.tag));
    const plaintext = Buffer.concat([decipher.update(fromBase64(envelope.data)), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString('utf8')) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const normalizeAlertConfigInput = (input: string): Record<string, unknown> | null => {
  const raw = input.trim();
  if (raw.length === 0) {
    return null;
  }

  if (/^https?:\/\//i.test(raw)) {
    return { webhook_url: raw };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};
