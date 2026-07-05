import { detectFileType } from './fileType';

/** Build a buffer from a byte header followed by optional trailing bytes. */
function buf(header: number[], tail: Buffer = Buffer.alloc(16)): Buffer {
  return Buffer.concat([Buffer.from(header), tail]);
}

describe('detectFileType — legitimate formats', () => {
  it('detects PNG', () => {
    expect(detectFileType(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      mime: 'image/png',
      ext: 'png',
    });
  });

  it('detects JPEG', () => {
    expect(detectFileType(buf([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
  });

  it('detects GIF (87a and 89a)', () => {
    expect(detectFileType(Buffer.from('GIF87a...........'))).toEqual({ mime: 'image/gif', ext: 'gif' });
    expect(detectFileType(Buffer.from('GIF89a...........'))).toEqual({ mime: 'image/gif', ext: 'gif' });
  });

  it('detects WebP', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
    expect(detectFileType(webp)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });

  it('detects PDF', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n%âãÏÓ'))).toEqual({ mime: 'application/pdf', ext: 'pdf' });
  });

  it('detects legacy DOC (OLE compound file)', () => {
    expect(detectFileType(buf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toEqual({
      mime: 'application/msword',
      ext: 'doc',
    });
  });

  it('detects a plain ZIP', () => {
    expect(detectFileType(buf([0x50, 0x4b, 0x03, 0x04]))).toEqual({ mime: 'application/zip', ext: 'zip' });
  });

  it('detects DOCX (ZIP containing a word/ entry)', () => {
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')]);
    expect(detectFileType(docx)).toEqual({
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: 'docx',
    });
  });

  it('detects plain text', () => {
    expect(detectFileType(Buffer.from('hello world, this is a note.\n'))).toEqual({
      mime: 'text/plain',
      ext: 'txt',
    });
  });
});

describe('detectFileType — spoofed / malicious payloads are rejected', () => {
  it('rejects an HTML document (the classic stored-XSS payload)', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>');
    expect(detectFileType(html)).toBeNull();
  });

  it('rejects a bare <script> payload', () => {
    expect(detectFileType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });

  it('rejects an SVG payload (executes script when rendered inline)', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(detectFileType(svg)).toBeNull();
  });

  it('rejects an XML/SVG declared with an <?xml prolog', () => {
    const xmlSvg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(detectFileType(xmlSvg)).toBeNull();
  });

  it('rejects HTML even when it is otherwise valid UTF-8 text', () => {
    // Mirrors the attack: upload payload.html declaring text/plain. Content wins.
    expect(detectFileType(Buffer.from('<html><h1>hi</h1></html>'))).toBeNull();
  });

  it('rejects unknown binary content', () => {
    expect(detectFileType(buf([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]))).toBeNull();
  });

  it('rejects empty / too-small buffers', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(Buffer.from([0x01]))).toBeNull();
  });
});
