import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const uploadDir = path.resolve(process.cwd(), './data/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `doc_${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB strict limit
    files: 2, // Max 2 documents per upload (DL + Student ID)
  },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('INVALID_FILE_TYPE: Allowed formats are JPEG, PNG, and WebP only'));
    }
    cb(null, true);
  },
});

// Magic-byte sniffing middleware to guarantee actual file contents match image signatures
export function verifyMagicBytes(req: Request, res: Response, next: NextFunction) {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] | undefined;
  if (!files) return next();

  const fileList: Express.Multer.File[] = Array.isArray(files)
    ? files
    : Object.values(files).flat();

  for (const file of fileList) {
    try {
      const buffer = Buffer.alloc(12);
      const fd = fs.openSync(file.path, 'r');
      fs.readSync(fd, buffer, 0, 12, 0);
      fs.closeSync(fd);

      const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47;
      const isWebp =
        buffer.toString('utf8', 0, 4) === 'RIFF' &&
        buffer.toString('utf8', 8, 12) === 'WEBP';

      if (!isJpeg && !isPng && !isWebp) {
        // Delete offending file immediately
        fs.unlinkSync(file.path);
        return res.status(400).json({
          error: `Security Verification Failed: ${file.originalname} is not a valid image file.`,
          code: 'INVALID_MAGIC_BYTES',
        });
      }
    } catch (err) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(500).json({ error: 'Failed to inspect uploaded file signatures.' });
    }
  }

  next();
}
