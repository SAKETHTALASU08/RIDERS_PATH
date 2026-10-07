import { sqlite } from '../db';
import { env } from '../config/env';
import { deletePrivateDocument } from './privateDocumentStorage';

export async function purgeExpiredDocuments(nowMs = Date.now()) {
  const unusedBefore = new Date(nowMs - env.UNUSED_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const usedBefore = new Date(nowMs - env.DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = sqlite.prepare(`
    SELECT d.id, d.object_key FROM user_documents d
    LEFT JOIN bookings b ON b.id = d.booking_id
    WHERE d.deleted_at IS NULL AND (
      (d.booking_id IS NULL AND d.uploaded_at < ?) OR
      (b.booking_status IN ('COMPLETED', 'CANCELLED', 'REJECTED') AND b.updated_at < ?)
    ) LIMIT 100
  `).all(unusedBefore, usedBefore) as Array<{ id: string; object_key: string }>;
  let removed = 0;
  for (const document of expired) {
    try {
      await deletePrivateDocument(document.object_key);
      sqlite.prepare('DELETE FROM user_documents WHERE id = ?').run(document.id);
      removed += 1;
    } catch (error) {
      console.error('Document retention cleanup failed for id:', document.id, error instanceof Error ? error.message : 'unknown');
    }
  }
  return removed;
}
