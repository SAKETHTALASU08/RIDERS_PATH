import { describe, expect, it } from 'vitest';
import { DOCUMENT_MAX_BYTES, validateDocumentFile } from '../features/documents/validateDocumentFile';

describe('document upload validation', () => {
  it('allows supported image types within the 5 MB limit', () => {
    expect(validateDocumentFile({ type: 'image/jpeg', size: DOCUMENT_MAX_BYTES })).toBeNull();
    expect(validateDocumentFile({ type: 'image/png', size: 2000 })).toBeNull();
    expect(validateDocumentFile({ type: 'image/webp', size: 2000 })).toBeNull();
  });

  it('rejects empty, oversized, and unsupported files with a field-level message', () => {
    expect(validateDocumentFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/i);
    expect(validateDocumentFile({ type: 'image/jpeg', size: DOCUMENT_MAX_BYTES + 1 })).toMatch(/5 MB/i);
    expect(validateDocumentFile({ type: 'application/pdf', size: 1000 })).toMatch(/JPEG, PNG, or WebP/i);
  });
});
