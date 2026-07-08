const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf'
]);

const FILE_SIGNATURES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46]
};

const resolveMimeType = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (ALLOWED_MIMETYPES.has(mime)) {
    return mime;
  }

  // Browsers on Windows often send application/octet-stream for PDF/images
  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream' || !mime) {
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
  }

  return mime;
};

const multerFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const resolvedMime = resolveMimeType(file);

  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMETYPES.has(resolvedMime)) {
    return cb(new Error('Only JPG, PNG, and PDF files are allowed.'));
  }

  // Normalize so content validation uses the correct signature
  file.mimetype = resolvedMime;
  return cb(null, true);
};

const validateFileContent = (filePath, expectedMimetype) => {
  const signature = FILE_SIGNATURES[expectedMimetype];
  if (!signature) {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    const buffer = Buffer.alloc(8);
    let fd;

    try {
      fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 8, 0);
      fs.closeSync(fd);
      resolve(signature.every((byte, index) => buffer[index] === byte));
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch (_) { /* ignore */ }
      }
      reject(error);
    }
  });
};

const hashFile = (filePath) => {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
};

module.exports = {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMETYPES,
  resolveMimeType,
  multerFileFilter,
  validateFileContent,
  hashFile
};
