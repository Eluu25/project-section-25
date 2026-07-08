const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { db } = require('../config/database');
const { resolveClientProfileByUser } = require('../utils/clientProfile');
const { multerFileFilter, validateFileContent, hashFile } = require('../utils/secureUpload');
const { assertReceiptNotDuplicate, generateReceiptReference, isReceiptDocumentType } = require('../utils/receiptService');
const {
  isClientRegistryDocumentType,
  findClientRegistryDocument
} = require('../utils/clientRegistryDocuments');
const { assertStaffCanAccessClient } = require('../utils/clientAccess');
const { LOAN_DOCUMENT_WHERE } = require('../utils/loanDocuments');
const { recordAuditEvent } = require('../utils/auditTrail');
const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File signature validation delegated to utils/secureUpload.js

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: multerFileFilter
});

// Get all documents
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'client') {
      const client = await resolveClientProfileByUser(req.user);
      if (!client) {
        return res.json([]);
      }

      return db.all('SELECT * FROM documents WHERE client_id = ? ORDER BY uploaded_at DESC', [client.id], (err, documents) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(documents);
      });
    }

    db.all(
      `SELECT d.*, c.name AS client_name
       FROM documents d
       LEFT JOIN clients c ON c.id = d.client_id
       ORDER BY d.uploaded_at DESC`,
      [],
      (err, documents) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(documents);
      }
    );
  } catch (error) {
    console.error('Document list error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const cleanupUploadedFile = (file) => {
  if (file?.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch (unlinkErr) {
      console.warn('Failed to remove uploaded file:', unlinkErr.message);
    }
  }
};

// Upload document (UC-L-002)
router.post('/upload', authenticateToken, authorizeRoles('loan_staff', 'saving_staff', 'client', 'admin', 'branch_manager', 'ceo'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { client_id, loan_id, type, approval_request_id, related_entity_type, related_entity_id } = req.body;
    const userId = req.user.id;

    let effectiveClientId = client_id;

    if (req.user.role === 'client') {
      const client = await resolveClientProfileByUser(req.user);
      if (!client) {
        cleanupUploadedFile(req.file);
        return res.status(404).json({ error: 'Client profile not found' });
      }
      effectiveClientId = client.id;
    }

    effectiveClientId = Number(effectiveClientId);
    if (!Number.isFinite(effectiveClientId) || effectiveClientId <= 0) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: 'A valid client is required before uploading documents' });
    }

    if (!type) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: 'Document type is required' });
    }

    const clientRow = await runGet('SELECT id FROM clients WHERE id = ?', [effectiveClientId]);
    if (!clientRow) {
      cleanupUploadedFile(req.file);
      return res.status(404).json({ error: 'Client not found. Select a valid savings account first.' });
    }

    if (loan_id) {
      const loan = await runGet('SELECT id FROM loan_accounts WHERE id = ?', [loan_id]);
      if (!loan) {
        cleanupUploadedFile(req.file);
        return res.status(404).json({ error: 'Loan account not found' });
      }
    }

    await proceedWithUpload(req, res, {
      effectiveClientId,
      loan_id,
      type,
      approval_request_id,
      related_entity_type,
      related_entity_id,
      userId
    });
  } catch (error) {
    cleanupUploadedFile(req.file);
    console.error('Document upload error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Upload failed',
      details: error.details || undefined
    });
  }
});

async function proceedWithUpload(req, res, ctx) {
  const {
    effectiveClientId,
    loan_id,
    type,
    approval_request_id,
    related_entity_type,
    related_entity_id,
    userId
  } = ctx;

  if (isClientRegistryDocumentType(type)) {
    const existingRegistry = await findClientRegistryDocument(effectiveClientId, type);
    if (existingRegistry) {
      cleanupUploadedFile(req.file);
      return res.json({
        ...existingRegistry,
        reused: true,
        message: 'This business/trade license is already on file for the client and will be used for all future loans.'
      });
    }
  }

  // Validate actual file content to prevent spoofing
    try {
      const isValidContent = await validateFileContent(req.file.path, req.file.mimetype);
      if (!isValidContent) {
        // Delete the uploaded file if content doesn't match declared type
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: 'File content does not match declared type. Possible file type spoofing attack.',
          violation_type: 'content_mismatch'
        });
      }
    } catch (validationError) {
      console.error('File content validation error:', validationError);
      // Delete the uploaded file on validation error
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'File validation failed' });
    }

  let fileHash = null;
  try {
    const rawHash = hashFile(req.file.path);
    if (isReceiptDocumentType(type)) {
      fileHash = rawHash;
      await assertReceiptNotDuplicate(fileHash, { clientId: effectiveClientId });
    }
  } catch (duplicateError) {
    fs.unlinkSync(req.file.path);
    if (duplicateError.statusCode === 409) {
      return res.status(409).json({
        error: duplicateError.message,
        code: duplicateError.code,
        existing_document_id: duplicateError.existing_document_id
      });
    }
    console.error('Receipt hash check failed:', duplicateError);
    return res.status(500).json({ error: 'Receipt validation failed' });
  }

    const docId = `DOC-${Date.now()}`;
    const version = 1;
    const receiptReference = isReceiptDocumentType(type) ? generateReceiptReference() : null;
    
    db.run(
      `INSERT INTO documents (id, client_id, loan_id, approval_request_id, related_entity_type, related_entity_id, type, file_name, file_path, file_hash, receipt_reference, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        effectiveClientId,
        loan_id || null,
        approval_request_id || null,
        related_entity_type || null,
        related_entity_id || null,
        type,
        req.file.filename,
        req.file.path,
        fileHash,
        receiptReference,
        'Verified',
        version
      ],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          const msg = String(err.message || '');
          if (msg.toLowerCase().includes('no such column') || msg.toLowerCase().includes('column')) {
            return res.status(500).json({
              error: 'Document storage schema is out of date. Restart the API after database migrations run.',
              details: msg
            });
          }
          if (msg.includes('UNIQUE constraint failed') && msg.includes('file_hash')) {
            return res.status(409).json({
              error: 'This file was already uploaded for this client. Use a different file or open the existing document.',
              code: 'DUPLICATE_DOCUMENT_HASH'
            });
          }
          return res.status(500).json({ error: 'Database error', details: msg });
        }
        
        // Create initial version record
        db.run(
          'INSERT INTO document_versions (document_id, version, file_name, file_path, uploaded_by, change_reason) VALUES (?, ?, ?, ?, ?, ?)',
          [docId, version, req.file.filename, req.file.path, userId, 'Initial upload'],
          (versionErr) => {
            if (versionErr) console.error('Document version log error:', versionErr);
          }
        );
        
        // Enhanced audit logging (UC-L-002)
        console.log(`[AUDIT] Document uploaded: ${docId} for client ${effectiveClientId} by user ${userId} at ${new Date().toISOString()}`);
        console.log(`[AUDIT] File name: ${req.file.originalname}, Type: ${type}, Size: ${req.file.size} bytes, Version: ${version}`);
        
        // Log to audit trail
        db.run(
          'INSERT INTO audit_trail (action, entity_type, entity_id, user_id, user_role, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['DOCUMENT_UPLOADED', 'document', docId, userId, req.user.role, JSON.stringify({ 
            file_name: req.file.originalname, 
            document_type: type,
            client_id: effectiveClientId,
            loan_id: loan_id,
            approval_request_id: approval_request_id || null,
            related_entity_type: related_entity_type || null,
            related_entity_id: related_entity_id || null,
            file_size: req.file.size,
            version: version
          }), new Date().toISOString()],
          (auditErr) => {
            if (auditErr) console.error('Audit log error:', auditErr);
          }
        );
        
        db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, document) => {
          if (err) {
            return res.status(500).json({ error: 'Database error', details: err.message });
          }
          res.status(201).json({
            ...document,
            message: 'Document uploaded successfully'
          });
        });
      }
    );
}

// Get documents by approval request (receipt/proof linkage)
router.get('/approval/:approvalRequestId', authenticateToken, authorizeRoles('admin', 'branch_manager', 'ceo', 'saving_staff', 'loan_staff', 'client'), async (req, res) => {
  const { approvalRequestId } = req.params;
  const normalized = String(approvalRequestId || '').trim();
  if (!normalized) {
    return res.status(400).json({ error: 'Approval request id is required' });
  }

  try {
    // For client role, return only documents belonging to the client.
    let effectiveClientId = null;
    if (req.user.role === 'client') {
      const client = await resolveClientProfileByUser(req.user);
      if (!client) {
        return res.json([]);
      }
      effectiveClientId = client.id;
    }

    const where = effectiveClientId
      ? 'WHERE approval_request_id = ? AND client_id = ?'
      : 'WHERE approval_request_id = ?';
    const params = effectiveClientId ? [normalized, effectiveClientId] : [normalized];

    db.all(`SELECT * FROM documents ${where} ORDER BY uploaded_at DESC`, params, (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      return res.json(rows || []);
    });
  } catch (error) {
    console.error('Approval documents error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Alternative Flow 2: File Size Limit
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large. Please compress or split the file.',
        violation_type: 'file_size_limit',
        max_size: '5MB'
      });
    }
  }
  
  // Alternative Flow 1: Unsupported Format
  if (err.message && err.message.includes('File format must be PDF or JPEG')) {
    return res.status(400).json({ 
      error: 'File format must be PDF or JPEG. Upload failed.',
      violation_type: 'unsupported_format'
    });
  }
  
  if (err.message && err.message.includes('Only JPG, PNG, and PDF')) {
    return res.status(400).json({
      error: err.message,
      violation_type: 'unsupported_format'
    });
  }

  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Verify document
router.post('/:id/verify', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run("UPDATE documents SET status = 'Verified' WHERE id = ?", [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    console.log(`[AUDIT] Document ${id} verified at ${new Date().toISOString()}`);
    res.json({ message: 'Document verified successfully' });
  });
});

// Reject document
router.post('/:id/reject', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is mandatory' });
  }

  db.run("UPDATE documents SET status = 'Rejected' WHERE id = ?", [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    console.log(`[AUDIT] Document ${id} rejected with reason: ${reason} at ${new Date().toISOString()}`);
    res.json({ message: 'Document rejected successfully' });
  });
});

// Delete document
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM documents WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    console.log(`[AUDIT] Document ${id} deleted at ${new Date().toISOString()}`);
    res.json({ message: 'Document deleted successfully' });
  });
});

// Get document versions
router.get('/:id/versions', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT dv.*, u.name as uploaded_by_name FROM document_versions dv LEFT JOIN users u ON dv.uploaded_by = u.id WHERE dv.document_id = ? ORDER BY dv.version DESC',
    [id],
    (err, versions) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(versions);
    }
  );
});

// Upload new version of document
router.post('/:id/version', authenticateToken, authorizeRoles('loan_staff', 'saving_staff'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { id } = req.params;
  const { change_reason } = req.body;
  const userId = req.user.id;

  // Get current document
  db.get('SELECT * FROM documents WHERE id = ?', [id], async (err, document) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Validate file content
    try {
      const isValidContent = await validateFileContent(req.file.path, req.file.mimetype);
      if (!isValidContent) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ 
          error: 'File content does not match declared type',
          violation_type: 'content_mismatch'
        });
      }
    } catch (validationError) {
      console.error('File content validation error:', validationError);
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'File validation failed' });
    }

    const newVersion = document.version + 1;

    // Update document with new version
    db.run(
      'UPDATE documents SET file_name = ?, file_path = ?, version = ? WHERE id = ?',
      [req.file.filename, req.file.path, newVersion, id],
      (updateErr) => {
        if (updateErr) {
          console.error('Database error:', updateErr);
          return res.status(500).json({ error: 'Database error' });
        }

        // Create version record
        db.run(
          'INSERT INTO document_versions (document_id, version, file_name, file_path, uploaded_by, change_reason) VALUES (?, ?, ?, ?, ?, ?)',
          [id, newVersion, req.file.filename, req.file.path, userId, change_reason || 'Document updated'],
          (versionErr) => {
            if (versionErr) console.error('Document version log error:', versionErr);
          }
        );

        console.log(`[AUDIT] Document ${id} updated to version ${newVersion} by user ${userId} at ${new Date().toISOString()}`);

        db.get('SELECT * FROM documents WHERE id = ?', [id], (err, updatedDoc) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          res.json({
            ...updatedDoc,
            message: 'Document version updated successfully'
          });
        });
      }
    );
  });
});

// Restore document to specific version
router.post('/:id/restore/:version', authenticateToken, authorizeRoles('loan_staff', 'saving_staff'), (req, res) => {
  const { id, version } = req.params;
  const userId = req.user.id;

  // Get version details
  db.get(
    'SELECT * FROM document_versions WHERE document_id = ? AND version = ?',
    [id, version],
    (err, versionRecord) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!versionRecord) {
        return res.status(404).json({ error: 'Version not found' });
      }

      // Restore document to this version
      db.run(
        'UPDATE documents SET file_name = ?, file_path = ?, version = ? WHERE id = ?',
        [versionRecord.file_name, versionRecord.file_path, version, id],
        (updateErr) => {
          if (updateErr) {
            console.error('Database error:', updateErr);
            return res.status(500).json({ error: 'Database error' });
          }

          console.log(`[AUDIT] Document ${id} restored to version ${version} by user ${userId} at ${new Date().toISOString()}`);

          res.json({
            message: 'Document restored successfully',
            restored_version: version
          });
        }
      );
    }
  );
});

// View document details
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM documents WHERE id = ?', [id], (err, document) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  });
});

const userCanAccessDocument = async (user, document) => {
  const role = user?.role;
  if (['admin', 'branch_manager', 'ceo', 'loan_staff', 'saving_staff'].includes(role)) {
    if (role === 'loan_staff' || role === 'saving_staff') {
      await assertStaffCanAccessClient(user, document.client_id);
    }
    return true;
  }
  if (role === 'client') {
    const client = await resolveClientProfileByUser(user);
    return client && String(client.id) === String(document.client_id);
  }
  return false;
};

// Download document
router.get('/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const document = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM documents WHERE id = ?', [id], (err, row) => (err ? reject(err) : resolve(row)));
    });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const allowed = await userCanAccessDocument(req.user, document);
    if (!allowed) {
      return res.status(403).json({ error: 'Not authorized to download this document' });
    }

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'File not found' });
    }

    console.log(`[AUDIT] Document ${id} downloaded by user ${req.user.id} at ${new Date().toISOString()}`);

    res.download(document.file_path, document.file_name, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      }
    });
  } catch (error) {
    if (error?.statusCode === 403) {
      return res.status(403).json({ error: error.message || 'Not authorized' });
    }
    console.error('Document download error:', error);
    return res.status(500).json({ error: 'Download failed' });
  }
});

router.get('/client/:clientId/registry', authenticateToken, async (req, res) => {
  try {
    const { listClientRegistryDocuments } = require('../utils/clientRegistryDocuments');
    const docs = await listClientRegistryDocuments(req.params.clientId);
    res.json(docs);
  } catch (error) {
    console.error('Registry documents error:', error);
    res.status(500).json({ error: 'Failed to load registry documents' });
  }
});

// Get documents by client
router.get('/client/:clientId', authenticateToken, (req, res) => {
  const { clientId } = req.params;

  db.all('SELECT * FROM documents WHERE client_id = ? ORDER BY uploaded_at DESC', [clientId], (err, documents) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(documents);
  });
});

// Get documents by loan
router.get('/loan/:loanId', authenticateToken, authorizeRoles('admin', 'branch_manager', 'ceo', 'loan_staff', 'saving_staff'), (req, res) => {
  const { loanId } = req.params;

  db.get('SELECT client_id FROM loan_accounts WHERE id = ?', [loanId], (loanErr, loan) => {
    if (loanErr) {
      console.error('Database error:', loanErr);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    db.all(
      `SELECT * FROM documents WHERE ${LOAN_DOCUMENT_WHERE} ORDER BY uploaded_at DESC`,
      [loanId, loanId, loan.client_id, loanId],
      (err, documents) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(documents || []);
      }
    );
  });
});

// Get documents by savings account
router.get('/savings/:savingsId', authenticateToken, (req, res) => {
  const { savingsId } = req.params;

  db.all(
    `SELECT * FROM documents
     WHERE (related_entity_type = 'savings_account' AND related_entity_id = ?)
        OR (related_entity_type = 'savings' AND related_entity_id = ?)
     ORDER BY uploaded_at DESC`,
    [savingsId, savingsId],
    (err, documents) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(documents);
    }
  );
});

// Get documents by related entity
router.get('/entity/:entityType/:entityId', authenticateToken, (req, res) => {
  const { entityType, entityId } = req.params;
  db.all(
    'SELECT * FROM documents WHERE related_entity_type = ? AND related_entity_id = ? ORDER BY uploaded_at DESC',
    [entityType, entityId],
    (err, documents) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(documents || []);
    }
  );
});

module.exports = router;
