/**
 * Content-based file type detection (issue #144).
 *
 * The chat upload endpoint must NOT trust the client-supplied Content-Type or
 * the original filename's extension — both are attacker-controlled and let an
 * adversary store an HTML/SVG payload that `express.static` later serves as an
 * executable document (stored XSS). Instead we sniff the actual bytes and
 * derive a safe extension from the detected type. Anything we can't positively
 * identify as an allowed format — including HTML and SVG — is rejected.
 */

export interface DetectedFileType {
  /** Canonical MIME type derived from the file content. */
  mime: string;
  /** Safe file extension (no leading dot) derived from the content. */
  ext: string;
}

/** Bytes that unambiguously indicate active/markup content we must never store. */
const DANGEROUS_MARKUP = /<\s*(!doctype\s+html|html|head|body|script|svg|iframe|object|embed|xml)\b/i;

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function asciiAt(buf: Buffer, offset: number, text: string): boolean {
  return startsWith(buf, [...text].map((c) => c.charCodeAt(0)), offset);
}

/**
 * Heuristic: does the buffer look like plain, non-markup UTF-8 text?
 * Rejects binary (NUL bytes) and anything containing HTML/SVG/XML markup.
 */
function looksLikePlainText(buf: Buffer): boolean {
  if (buf.length === 0) return false;

  // Sample the head — a NUL byte means binary, not text.
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  if (sample.includes(0x00)) return false;

  let text: string;
  try {
    // Reject invalid UTF-8 (fatal decode).
    text = new TextDecoder('utf-8', { fatal: true }).decode(sample);
  } catch {
    return false;
  }

  if (DANGEROUS_MARKUP.test(text)) return false;

  return true;
}

/**
 * Detect the file type from its raw bytes. Returns null if the content is not a
 * positively-identified allowed format (e.g. HTML, SVG, or unknown binary).
 */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (!buffer || buffer.length < 4) return null;

  // --- Images ---
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // GIF: "GIF87a" / "GIF89a"
  if (asciiAt(buffer, 0, 'GIF87a') || asciiAt(buffer, 0, 'GIF89a')) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WebP: "RIFF" .... "WEBP"
  if (asciiAt(buffer, 0, 'RIFF') && asciiAt(buffer, 8, 'WEBP')) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // --- Documents ---
  // PDF: "%PDF-"
  if (asciiAt(buffer, 0, '%PDF-')) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  // Legacy MS Office (.doc) — OLE compound file: D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { mime: 'application/msword', ext: 'doc' };
  }
  // ZIP family (also OOXML .docx): "PK\x03\x04" / "PK\x05\x06" / "PK\x07\x08"
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])
  ) {
    // A .docx is a ZIP whose entries include a "word/" directory. ZIP stores
    // entry names in plaintext, so we can look for that marker in the bytes.
    if (buffer.includes(Buffer.from('word/'))) {
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
      };
    }
    return { mime: 'application/zip', ext: 'zip' };
  }

  // --- Plain text (no magic bytes) ---
  if (looksLikePlainText(buffer)) {
    return { mime: 'text/plain', ext: 'txt' };
  }

  // Unknown / disallowed (HTML, SVG, arbitrary binary) → reject.
  return null;
}

/** True when the detected type is one of the formats the app accepts. */
export function isAllowedFileType(detected: DetectedFileType | null): detected is DetectedFileType {
  return detected !== null;
}
