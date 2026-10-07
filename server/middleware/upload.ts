import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// Keep uploaded bytes in memory only until they are normalized and encrypted or sent to S3.
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, parts: 5 },
});

export function detectImageMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function verifyMagicBytes(req: Request, res: Response, next: NextFunction) {
  const file = req.file || (req.files as Express.Multer.File[] | undefined)?.[0];
  if (!file || !detectImageMime(file.buffer)) {
    return res.status(400).json({ error: 'Choose a valid JPEG, PNG, or WebP image.', code: 'INVALID_FILE_TYPE' });
  }
  next();
}
