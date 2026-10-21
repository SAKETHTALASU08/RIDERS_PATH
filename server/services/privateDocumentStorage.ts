import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

const localDirectory = path.resolve(process.cwd(), 'data/private-documents');
const s3Client = env.DOCUMENT_STORAGE_DRIVER === 's3'
  ? new S3Client({
      region: env.DOCUMENT_S3_REGION,
      ...(env.DOCUMENT_S3_ENDPOINT ? { endpoint: env.DOCUMENT_S3_ENDPOINT, forcePathStyle: true } : {}),
    })
  : null;

function localKey(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid document key');
  return `${id}.enc`;
}

function encryptionKey() {
  const configured = env.DOCUMENT_ENCRYPTION_KEY;
  const key = configured
    ? Buffer.from(configured, 'base64')
    : env.NODE_ENV === 'test'
      ? crypto.createHash('sha256').update('riders-path-test-only-document-encryption-key').digest()
      : Buffer.alloc(0);
  if (key.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  return key;
}

export async function storePrivateDocument(id: string, bytes: Buffer, contentType: string) {
  if (env.DOCUMENT_STORAGE_DRIVER === 's3') {
    if (!s3Client || !env.DOCUMENT_S3_BUCKET) throw new Error('S3 document storage is not configured');
    await s3Client.send(new PutObjectCommand({
      Bucket: env.DOCUMENT_S3_BUCKET,
      Key: `student-documents/${id}`,
      Body: bytes,
      ContentType: contentType,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: env.DOCUMENT_S3_KMS_KEY_ID,
    }));
    return `student-documents/${id}`;
  }
  // Local storage is allowed when DOCUMENT_STORAGE_DRIVER is 'local' (default).
  // Files are stored encrypted on the server's local disk.
  await fs.mkdir(localDirectory, { recursive: true, mode: 0o700 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const payload = Buffer.concat([Buffer.from('RPD1'), iv, cipher.getAuthTag(), encrypted]);
  await fs.writeFile(path.join(localDirectory, localKey(id)), payload, { mode: 0o600, flag: 'wx' });
  return localKey(id);
}

export async function readPrivateDocument(key: string) {
  if (env.DOCUMENT_STORAGE_DRIVER === 's3') {
    if (!s3Client || !env.DOCUMENT_S3_BUCKET) throw new Error('S3 document storage is not configured');
    const result = await s3Client.send(new GetObjectCommand({ Bucket: env.DOCUMENT_S3_BUCKET, Key: key }));
    if (!result.Body) throw new Error('Document not found');
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return { bytes: Buffer.concat(chunks), contentType: result.ContentType || 'image/jpeg' };
  }
  const payload = await fs.readFile(path.join(localDirectory, localKey(path.basename(key, '.enc'))));
  if (payload.length < 32 || payload.subarray(0, 4).toString() !== 'RPD1') throw new Error('Encrypted document is invalid');
  const iv = payload.subarray(4, 16);
  const tag = payload.subarray(16, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return { bytes: Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]), contentType: 'image/jpeg' };
}

export async function deletePrivateDocument(key: string) {
  if (env.DOCUMENT_STORAGE_DRIVER === 's3') {
    if (!s3Client || !env.DOCUMENT_S3_BUCKET) throw new Error('S3 document storage is not configured');
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.DOCUMENT_S3_BUCKET, Key: key }));
    return;
  }
  await fs.rm(path.join(localDirectory, localKey(path.basename(key, '.enc'))), { force: true });
}

export function createShortLivedDocumentUrl(documentId: string, actorId: string) {
  const expires = Math.floor(Date.now() / 1000) + 60;
  const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(`${documentId}:${expires}:${actorId}`).digest('hex');
  return `/api/admin/documents/${encodeURIComponent(documentId)}/content?expires=${expires}&actor=${encodeURIComponent(actorId)}&signature=${signature}`;
}
