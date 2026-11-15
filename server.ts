import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import express from 'express';

const execFileAsync = promisify(execFile);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIA_DIR = path.resolve(__dirname, 'storage', 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif|gif)$/;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '40mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/media/convert-heic', async (req, res) => {
    const tmpId = crypto.randomUUID().replace(/-/g, '');
    const inPath = path.join(os.tmpdir(), `${tmpId}.heic`);
    const outPath = path.join(os.tmpdir(), `${tmpId}.jpg`);

    try {
      const { base64 } = req.body as { base64?: string };
      if (!base64 || typeof base64 !== 'string') {
        res.status(400).json({ error: 'Missing HEIC base64 payload.' });
        return;
      }

      const rawBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
      const inputBuffer = Buffer.from(rawBase64, 'base64');
      if (inputBuffer.length === 0 || inputBuffer.length > 25 * 1024 * 1024) {
        res.status(413).json({ error: 'HEIC file must be under 25 MB.' });
        return;
      }

      fs.writeFileSync(inPath, inputBuffer);
      await execFileAsync('convert', [inPath, '-auto-orient', '-quality', '92', outPath], {
        timeout: 30000,
      });

      if (!fs.existsSync(outPath)) {
        res.status(500).json({ error: 'HEIC conversion produced no output.' });
        return;
      }

      const outBuffer = fs.readFileSync(outPath);
      res.json({
        dataUrl: `data:image/jpeg;base64,${outBuffer.toString('base64')}`,
      });
    } catch (err) {
      console.error('HEIC server conversion error:', err);
      res.status(422).json({ error: 'Server could not decode this HEIC file.' });
    } finally {
      try {
        if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
      } catch {
        // ignore cleanup error
      }
      try {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch {
        // ignore cleanup error
      }
    }
  });

  app.post('/api/media/upload', (req, res) => {
    try {
      const { dataUrl, fileName, ownerId } = req.body as {
        dataUrl?: string;
        fileName?: string;
        ownerId?: string;
      };

      if (!ownerId || !SAFE_ID_RE.test(ownerId)) {
        res.status(401).json({ error: 'Authenticated artist identity is required to upload.' });
        return;
      }

      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Missing image payload.' });
        return;
      }

      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!match) {
        res.status(400).json({ error: 'Invalid image data format.' });
        return;
      }

      const mimeType = match[1].toLowerCase();
      const ext = ALLOWED_MIME_TO_EXT[mimeType];
      if (!ext) {
        res.status(415).json({ error: 'Unsupported image format. Please upload JPEG, PNG, WebP, AVIF, or GIF.' });
        return;
      }

      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
        res.status(413).json({ error: 'Image size must be under 25 MB.' });
        return;
      }

      const mediaId = crypto.randomUUID().replace(/-/g, '');
      const storedFilename = `${mediaId}.${ext}`;
      const filePath = path.join(MEDIA_DIR, storedFilename);
      const metaPath = path.join(MEDIA_DIR, `${storedFilename}.json`);

      fs.writeFileSync(filePath, buffer);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          ownerId,
          originalName: typeof fileName === 'string' ? fileName.slice(0, 120) : storedFilename,
          mimeType,
          sizeBytes: buffer.length,
          uploadedAt: new Date().toISOString(),
        }),
      );

      res.status(201).json({
        mediaId,
        filename: storedFilename,
        imageUrl: `/api/media/${storedFilename}`,
        mimeType,
        sizeBytes: buffer.length,
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to store uploaded artwork.' });
    }
  });

  app.get('/api/media/:filename', (req, res) => {
    const { filename } = req.params;
    if (!SAFE_FILENAME_RE.test(filename)) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }

    const filePath = path.join(MEDIA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Artwork file not found.' });
      return;
    }

    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = EXT_TO_MIME[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  });

  app.get('/api/media/:filename/download', (req, res) => {
    const { filename } = req.params;
    const uid = typeof req.query.uid === 'string' ? req.query.uid : '';
    if (!SAFE_FILENAME_RE.test(filename)) {
      res.status(400).json({ error: 'Invalid media identifier.' });
      return;
    }

    const filePath = path.join(MEDIA_DIR, filename);
    const metaPath = path.join(MEDIA_DIR, `${filename}.json`);
    if (!fs.existsSync(filePath) || !fs.existsSync(metaPath)) {
      res.status(404).json({ error: 'Artwork file not found.' });
      return;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        ownerId: string;
        originalName?: string;
        mimeType?: string;
      };

      if (!uid || uid !== meta.ownerId) {
        res.status(403).json({ error: 'Only the uploading artist can download the original file.' });
        return;
      }

      const downloadName = (meta.originalName || filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(filePath);
    } catch {
      res.status(500).json({ error: 'Unable to verify download permission.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`myartpieces gallery server listening on port ${port}`);
  });
}

startServer();
