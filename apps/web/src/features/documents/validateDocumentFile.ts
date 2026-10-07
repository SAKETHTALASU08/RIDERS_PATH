export type DocumentType = 'driving_license' | 'student_id' | 'aadhaar';
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validateDocumentFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_MIME_TYPES[number])) {
    return 'Choose a JPEG, PNG, or WebP image.';
  }
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > DOCUMENT_MAX_BYTES) return 'Choose an image no larger than 5 MB.';
  return null;
}
