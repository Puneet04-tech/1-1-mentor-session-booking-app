import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { detectFileType } from '@/utils/fileType';

const router = Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'chat');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, per issue requirement

// Buffer the upload in memory so we can inspect the ACTUAL bytes before writing
// anything to disk. We never trust the client Content-Type or filename (#144):
// the stored file's type and extension are derived from magic-byte detection.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Upload a chat attachment (image or file). Returns the metadata the
// chat message payload embeds: { url, type, name, size }.
router.post('/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds the 10MB size limit' });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Invalid file' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Authoritative validation: detect the type from the file's own bytes.
    const detected = detectFileType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({
        error: 'Unsupported or unsafe file. Allowed: JPEG, PNG, GIF, WebP, PDF, TXT, DOC, DOCX, ZIP.',
      });
    }

    // Store under a random name with a content-derived extension — never the
    // client-supplied extension. This is what express.static uses to set the
    // response Content-Type, so a spoofed .html can no longer be served.
    const filename = `${uuidv4()}.${detected.ext}`;
    try {
      await fs.promises.writeFile(
        path.join(UPLOAD_DIR, filename),
        req.file.buffer
      );
    } catch (writeErr) {
      console.error('Failed to persist upload:', writeErr);
      return res.status(500).json({
        error: 'Failed to store file'
      });
    }

    const sanitizedName = req.file.originalname
      .trim()
      .replace(/[\r\n\t]/g, '')
      .slice(0, 255);

    res.json({
      success: true,
      data: {
        url: `/uploads/chat/${filename}`,
        type: detected.mime,
        name: sanitizedName,
        size: req.file.size,
      },
    });
  });
});

export default router;
