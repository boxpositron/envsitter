import { createHmac } from 'node:crypto';

export type FingerprintAlgorithm = 'hmac-sha256';

export type FingerprintResult = {
  algorithm: FingerprintAlgorithm;
  digestBytes: Uint8Array;
};

export function fingerprintValueHmacSha256(value: string, pepperBytes: Uint8Array): FingerprintResult {
  const hmac = createHmac('sha256', Buffer.from(pepperBytes));
  hmac.update(value, 'utf8');
  return { algorithm: 'hmac-sha256', digestBytes: new Uint8Array(hmac.digest()) };
}
