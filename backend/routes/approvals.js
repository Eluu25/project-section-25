const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { db } = require('../config/database');
const { recordAuditEvent } = require('../utils/auditTrail');
const { emitLoanUpdated, emitBalanceUpdated } = require('../utils/realtime');
const { ensureClientUserCredentials, ensureRegistrationRequestCredentialColumns } = require('./clients');
const {
  sendEmail,
  sendLoanApprovalEmail,
  sendLoanRejectionEmail,
  fireAndForgetEmail,
  sendDepositSuccessEmail,
  sendWithdrawalSuccessEmail
} = require('../utils/emailService');
const { sendEmailReminder } = require('../utils/notificationService');
const {
  notifyApprovalPendingStaff,
  notifyApprovalRequester,
  notifyClientProcess,
  labelApprovalType
} = require('../utils/processEmails');
const { markReceiptDocumentConsumed, assertReceiptDocumentAvailable } = require('../utils/receiptService');
const { withTransaction } = require('../utils/transactionWrapper');
const { cancelPendingTransactionForApproval } = require('../utils/pendingApprovalTransaction');

const safeSendClientEmail = async ({ clientId, subject, text, category, metadata = {} }) => {
  if (!clientId) return;
  try {
    const client = await new Promise((resolve, reject) => {
      db.get('SELECT id, name, email FROM clients WHERE id = ?', [clientId], (err, row) => (err ? reject(err) : resolve(row || null)));
    });
    if (!client?.email) return;
    await sendEmailReminder({
      to: client.email,
      subject,
      text,
      category: category || 'client_notification',
      metadata: { client_id: clientId, ...metadata }
    });
  } catch (e) {
    console.warn('Client email send failed:', e?.message || e);
  }
};

// Approval thresholds (ETB)
const APPROVAL_THRESHOLDS = {
  branch_manager: 100000,      // Branch Manager can approve up to 100,000 ETB
  ceo: Infinity                // CEO can approve any amount
};

// Generate approval request ID
const generateApprovalId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `APR-${timestamp}-${random}`;
};

// Determine approval level based on amount
const getApprovalLevel = (amount) => {
  if (amount <= APPROVAL_THRESHOLDS.branch_manager) {
    return 'branch_manager';
  }
  return 'ceo';
};

// Create approval request
const createApprovalRequest = async (type, entityId, amount, requestedBy, details) => {
  const approvalLevel = getApprovalLevel(amount);
  const approvalId = generateApprovalId();
  
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO approval_requests (id, type, entity_id, amount, requested_by, status, approval_level, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [approvalId, type, entityId, amount, requestedBy, 'Pending', approvalLevel, JSON.stringify(details)],
      function(err) {
        if (err) reject(err);
        else resolve(approvalId);
      }
    );
  });

  notifyApprovalPendingStaff({
    requestId: approvalId,
    type,
    amount,
    entityId,
    requestedBy
  }).catch((e) => console.warn('Approval pending staff email failed:', e?.message || e));

  return approvalId;
};

const parseRequestDetails = (request) => {
  if (!request?.details) {
    return {};
  }

  try {
    return typeof request.details === 'string' ? JSON.parse(request.details) : request.details;
  } catch (parseError) {
    console.warn('Failed to parse approval request details:', parseError.message);
    return {};
  }
};

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ changes: this.changes });
  });
});

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const safeRecordAudit = async (payload, contextLabel) => {
  try {
    await recordAuditEvent(payload);
  } catch (error) {
    console.warn(`Audit logging failed (${contextLabel}):`, error?.message || error);
  }
};

const findLinkedDocuments = async (request) => {
  if (!request?.id) return [];
  const details = parseRequestDetails(request);
  const receiptDocId = details.receipt_document_id || details.receiptDocId || null;
  const relatedEntityType = details.related_entity_type || details.relatedEntityType || null;
  const relatedEntityId = details.related_entity_id || details.relatedEntityId || request.entity_id || null;

  if (receiptDocId) {
    const doc = await runGet('SELECT * FROM documents WHERE id = ?', [receiptDocId]);
    return doc ? [doc] : [];
  }

  // Prefer approval_request linkage if available; fall back to related entity linkage.
  const docs = await runAll(
    `SELECT *
     FROM documents
     WHERE approval_request_id = ?
        OR (related_entity_id = ? AND (? IS NULL OR related_entity_type = ?))
     ORDER BY uploaded_at DESC`,
    [request.id, relatedEntityId, relatedEntityType, relatedEntityType]
  );
  return docs || [];
};

const { isApprovalRequestReadyForBranchManager, enrichApprovalReadiness } = require('../utils/approvalReadiness');

const preflightApprovalRequirements = async (request) => {
  const details = parseRequestDetails(request);
  const requiresReceiptProof = Boolean(details.requires_receipt_proof || details.requiresReceiptProof);
  if (!requiresReceiptProof) {
    return;
  }

  // Enforce receipt proof for workflows that depend on external evidence.
  const typesRequiringProof = new Set(['transaction_deposit']);
  if (!typesRequiringProof.has(request.type)) {
    return;
  }

  const linked = await findLinkedDocuments(request);
  if (!linked || linked.length === 0) {
    const err = new Error('Receipt/proof is required before approval. Please attach the receipt document first.');
    err.statusCode = 400;
    err.code = 'MISSING_RECEIPT_PROOF';
    throw err;
  }

  const receiptDocId = details.receipt_document_id || details.receiptDocId || linked[0]?.id;
  if (receiptDocId) {
    await assertReceiptDocumentAvailable(receiptDocId, { excludeApprovalId: request.id });
    const doc = await runGet('SELECT id, status, consumed_at, file_hash FROM documents WHERE id = ?', [receiptDocId]);
    if (!doc) {
      const err = new Error('Linked receipt document was not found.');
      err.statusCode = 404;
      throw err;
    }
    if (doc.consumed_at) {
      const err = new Error('This receipt was already used for another transaction.');
      err.statusCode = 409;
      err.code = 'RECEIPT_ALREADY_USED';
      throw err;
    }
  }
};

const canCancelApprovalRequest = (request, user) => {
  if (!request || request.status !== 'Pending') return false;
  const privileged = ['admin', 'branch_manager', 'ceo', 'saving_staff', 'loan_staff'].includes(user.role);
  if (privileged) return true;
  return Number(request.requested_by) === Number(user.id);
};

const assertApprovalActionable = async (request) => {
  if (!request) return;
  if (request.status === 'Cancelled') {
    const err = new Error('This request was cancelled and cannot be processed');
    err.statusCode = 400;
    throw err;
  }
  if (!request.requested_by) return;
  const requester = await runGet('SELECT id, status, username FROM users WHERE id = ?', [request.requested_by]);
  if (!requester) {
    const err = new Error('The user who submitted this request no longer exists. Cancel or reject this item.');
    err.statusCode = 409;
    throw err;
  }
  if (['Archived', 'Inactive', 'Suspended'].includes(requester.status)) {
    const err = new Error(`Cannot process request — requester account is ${requester.status}`);
    err.statusCode = 409;
    throw err;
  }
};

const markApprovalStatus = (id, status, fields) => new Promise((resolve, reject) => {
  const { justification, reviewedBy } = fields;
  db.run(
    `UPDATE approval_requests
     SET status = ?, justification = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
     WHERE id = ? AND status = 'Pending'`,
    [status, justification, reviewedBy, id],
    function onUpdate(err) {
      if (err) reject(err);
      else if (this.changes === 0) {
        const error = new Error('Request has already been processed or was cancelled');
        error.statusCode = 409;
        error.code = 'APPROVAL_ALREADY_PROCESSED';
        reject(error);
      } else resolve();
    }
  );
});

// Staff/manager: recent approval activity including client-cancelled items
router.get('/activity', authenticateToken, authorizeRoles('saving_staff', 'loan_staff', 'branch_manager', 'admin', 'ceo'), (req, res) => {
  const statusParam = String(req.query.status || 'Pending,Cancelled').trim();
  const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
  const placeholders = statuses.map(() => '?').join(',');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

  db.all(
    `SELECT ar.*, u.username AS requested_by_name, c.name AS client_name
     FROM approval_requests ar
     LEFT JOIN users u ON u.id = ar.requested_by
     LEFT JOIN savings_accounts sa ON sa.id = ar.entity_id AND ar.type IN ('account_creation', 'savings_account_approval', 'transaction_deposit', 'transaction_withdraw')
     LEFT JOIN loan_accounts la ON la.id = ar.entity_id AND ar.type = 'loan_origination'
     LEFT JOIN clients c ON c.id = COALESCE(sa.client_id, la.client_id)
     WHERE ar.status IN (${placeholders})
     ORDER BY ar.reviewed_at DESC, ar.created_at DESC
     LIMIT ?`,
    [...statuses, limit],
    (err, rows) => {
      if (err) {
        console.error('Approval activity error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows || []);
    }
  );
});

// Pending approval requests submitted by the current user (client/staff)
router.get('/my-requests', authenticateToken, (req, res) => {
  db.all(
    `SELECT ar.*, u.username AS requested_by_name
     FROM approval_requests ar
     LEFT JOIN users u ON ar.requested_by = u.id
     WHERE ar.requested_by = ? AND ar.status = 'Pending'
     ORDER BY ar.created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error('My approval requests error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows || []);
    }
  );
});

async function cleanupCancelledApproval(request) {
  if (['transaction_deposit', 'transaction_withdraw'].includes(request.type)) {
    await cancelPendingTransactionForApproval(request.id, 'Cancelled');
    return;
  }

  if (request.type === 'account_creation' || request.type === 'savings_account_approval') {
    await runExec(
      `UPDATE savings_accounts
       SET status = 'Cancelled'
       WHERE id = ? AND status IN ('Pending', 'Pending Approval', 'High Priority')`,
      [request.entity_id]
    );
    return;
  }

  if (request.type === 'loan_origination') {
    await runExec(
      `UPDATE loan_accounts
       SET status = 'Cancelled'
       WHERE id = ? AND status IN ('Pending', 'Pending Branch Manager Review', 'Pending CEO Review')`,
      [request.entity_id]
    );
    emitLoanUpdated({ loanId: request.entity_id, status: 'Cancelled' });
  }
}

// Cancel a pending approval request (requester or privileged staff)
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const request = await runGet('SELECT * FROM approval_requests WHERE id = ?', [id]);
    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }
    if (!canCancelApprovalRequest(request, req.user)) {
      return res.status(403).json({ error: 'You are not allowed to cancel this request' });
    }

    await withTransaction(async () => {
      const { changes } = await runExec(
        `UPDATE approval_requests
         SET status = 'Cancelled', justification = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
         WHERE id = ? AND status = 'Pending'`,
        [reason || 'Cancelled by requester', req.user.id, id]
      );
      if (!changes) {
        const err = new Error('Request was already processed');
        err.statusCode = 409;
        throw err;
      }
      await cleanupCancelledApproval(request);
    });

    recordAuditEvent({
      action: 'APPROVAL_CANCELLED',
      entityType: 'approval_request',
      entityId: id,
      user: req.user,
      details: { reason: reason || 'Cancelled', type: request.type }
    }).catch(() => {});

    notifyApprovalRequester({
      requestId: id,
      type: request.type,
      requestedBy: request.requested_by,
      processType: 'request_cancelled',
      reason: reason || 'Cancelled by requester'
    }).catch(() => {});

    const cancelDetails = parseRequestDetails(request);
    const cancelClientId = cancelDetails.client_id || cancelDetails.clientId || null;
    if (cancelClientId) {
      notifyClientProcess(cancelClientId, 'request_cancelled', {
        type: request.type,
        requestId: id
      });
    }

    return res.json({
      message: 'Request cancelled successfully',
      status: 'Cancelled',
      type: request.type,
      entity_id: request.entity_id
    });
  } catch (error) {
    console.error('Cancel approval error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to cancel request' });
  }
});

// Get pending approvals for current user based on role
router.get('/pending', authenticateToken, authorizeRoles('branch_manager', 'ceo', 'admin'), (req, res) => {
  const userRole = req.user.role;
  
  let whereClause = "ar.status = 'Pending'";
  const params = [];
  
  // Filter by approval level based on role
  if (userRole === 'branch_manager') {
    whereClause += " AND ar.approval_level = 'branch_manager'";
  }
  // CEO can see all pending approvals
  
  db.all(`
    SELECT ar.*, u.username as requested_by_name 
    FROM approval_requests ar 
    LEFT JOIN users u ON ar.requested_by = u.id 
    WHERE ${whereClause}
      AND (ar.requested_by IS NULL OR u.id IS NOT NULL)
    ORDER BY ar.created_at DESC
  `, params, async (err, requests) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    try {
      const enriched = await Promise.all((requests || []).map(async (request) => {
        const attachmentRow = await runGet(
          'SELECT COUNT(*) AS count FROM documents WHERE approval_request_id = ?',
          [request.id]
        );
        const attachmentCount = Number(attachmentRow?.count || 0);
        let base = { ...request, attachment_count: attachmentCount };

        if (['transaction_deposit', 'transaction_withdraw'].includes(request.type)) {
          const details = parseRequestDetails(request);
          if (!details.client_name || !details.savings_type) {
            const account = await runGet('SELECT id, client_id, type FROM savings_accounts WHERE id = ?', [request.entity_id]);
            if (account) {
              const client = await runGet('SELECT id, name FROM clients WHERE id = ?', [account.client_id]);
              const mergedDetails = {
                ...details,
                client_id: details.client_id || account.client_id,
                client_name: details.client_name || client?.name || `Client-${account.client_id}`,
                account_type: details.account_type || 'savings',
                savings_type: details.savings_type || account.type,
                transaction_type: details.transaction_type || (request.type === 'transaction_withdraw' ? 'withdrawal' : 'deposit')
              };
              base = { ...base, details: JSON.stringify(mergedDetails) };
            }
          }
        }

        return enrichApprovalReadiness(base);
      }));

      res.json(enriched);
    } catch (enrichError) {
      console.error('Pending approval enrichment error:', enrichError);
      res.json(requests);
    }
  });
});

// Get all approvals (admin view)
router.get('/all', authenticateToken, authorizeRoles('admin'), (req, res) => {
  db.all(`
    SELECT ar.*, u.username as requested_by_name, r.username as reviewed_by_name 
    FROM approval_requests ar 
    LEFT JOIN users u ON ar.requested_by = u.id 
    LEFT JOIN users r ON ar.reviewed_by = r.id 
    ORDER BY ar.created_at DESC
  `, [], (err, requests) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(requests);
  });
});

// Get approval history summary (branch manager/admin/ceo)
router.get('/history', authenticateToken, authorizeRoles('branch_manager', 'admin', 'ceo'), (req, res) => {
  const { type } = req.query;
  const allowedTypes = ['loan_origination', 'account_creation', 'savings_account_approval'];
  const requestedTypes = type
    ? String(type).split(',').map((item) => item.trim()).filter(Boolean)
    : allowedTypes;
  const filteredTypes = requestedTypes.filter((item) => allowedTypes.includes(item));
  if (filteredTypes.length === 0) {
    return res.status(400).json({ error: 'Unsupported approval history type filter.' });
  }

  const placeholders = filteredTypes.map(() => '?').join(',');
  db.all(
    `SELECT id, type, entity_id, amount, status, approval_level, created_at, reviewed_at, reviewed_by
     FROM approval_requests
     WHERE type IN (${placeholders})
       AND status IN ('Approved', 'Rejected')
     ORDER BY COALESCE(reviewed_at, created_at) DESC
     LIMIT 200`,
    filteredTypes,
    (err, rows) => {
      if (err) {
        console.error('Approval history query error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      const normalized = Array.isArray(rows) ? rows : [];
      const summary = normalized.reduce((acc, item) => {
        const key = item.type;
        if (!acc[key]) {
          acc[key] = { approved: 0, rejected: 0, total: 0 };
        }
        if (item.status === 'Approved') acc[key].approved += 1;
        if (item.status === 'Rejected') acc[key].rejected += 1;
        acc[key].total += 1;
        return acc;
      }, {});

      return res.json({
        summary,
        history: normalized
      });
    }
  );
});

// Approve request
router.post('/:id/approve', authenticateToken, authorizeRoles('branch_manager', 'ceo', 'admin'), (req, res) => {
  const { id } = req.params;
  const { justification } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Get approval request details
  db.get('SELECT * FROM approval_requests WHERE id = ?', [id], async (err, request) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    try {
      await assertApprovalActionable(request);
    } catch (actionErr) {
      return res.status(actionErr.statusCode || 400).json({ error: actionErr.message });
    }
    
    // Check if user has authority to approve at this level
    if (request.approval_level === 'ceo' && userRole !== 'ceo' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Insufficient privileges to approve this request' });
    }

    const readiness = await enrichApprovalReadiness(request);
    if (userRole === 'branch_manager' && !readiness.ready_for_branch_review) {
      return res.status(400).json({
        error: 'This request is not ready for branch review. Resolve missing proof or requirements first.',
        code: 'NOT_READY_FOR_REVIEW',
        readiness_blockers: readiness.readiness_blockers || []
      });
    }

    try {
      await preflightApprovalRequirements(request);
    } catch (preflightError) {
      return res.status(preflightError.statusCode || 400).json({
        error: preflightError.message || 'Approval preflight failed',
        code: preflightError.code || 'PREFLIGHT_FAILED'
      });
    }

    const existingExecution = await runGet(
      `SELECT id, transaction_type, amount, status
       FROM transactions WHERE approval_request_id = ? LIMIT 1`,
      [id]
    );
    if (existingExecution && String(existingExecution.status || '').toLowerCase() === 'completed') {
      return res.status(409).json({
        error: 'This approval was already executed',
        code: 'ALREADY_EXECUTED',
        transaction_id: existingExecution.id
      });
    }

    const approvedRequest = {
      ...request,
      status: 'Approved',
      reviewed_by: userId,
      justification: justification || 'Approved'
    };

    try {
      const result = await withTransaction(async () => {
        await markApprovalStatus(id, 'Approved', {
          justification: justification || 'Approved',
          reviewedBy: userId
        });
        return executeApprovedAction(approvedRequest);
      });

      console.log(`[AUDIT] Approval request ${id} approved by ${userRole} (ID: ${userId}) at ${new Date().toISOString()}`);

      recordAuditEvent({
        action: 'APPROVAL_APPROVED',
        entityType: 'approval_request',
        entityId: id,
        user: req.user,
        details: { amount: request.amount, type: request.type, justification: justification || 'Approved' }
      }).catch(() => {});
      notifyApprovalRequester({
        requestId: id,
        type: request.type,
        requestedBy: request.requested_by,
        approved: true
      }).catch(() => {});

      return res.json({
        message: 'Request approved successfully',
        execution: result || null
      });
    } catch (executionError) {
      if (executionError.statusCode === 409) {
        return res.status(409).json({
          error: executionError.message,
          code: executionError.code || 'APPROVAL_ALREADY_PROCESSED'
        });
      }
      console.error('Approval execution error:', executionError);
      return res.status(executionError.statusCode || 500).json({
        error: executionError.message || 'Approval failed — no changes were committed',
        code: executionError.code || 'APPROVAL_EXECUTION_FAILED'
      });
    }
  });
});

// Reject request
router.post('/:id/reject', authenticateToken, authorizeRoles('branch_manager', 'ceo', 'admin'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Get approval request details
  db.get('SELECT * FROM approval_requests WHERE id = ?', [id], async (err, request) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }
    
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    try {
      await assertApprovalActionable(request);
    } catch (actionErr) {
      return res.status(actionErr.statusCode || 400).json({ error: actionErr.message });
    }
    
    // Check if user has authority to reject at this level
    if (request.approval_level === 'ceo' && userRole !== 'ceo' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Insufficient privileges to reject this request' });
    }
    
    try {
      const result = await withTransaction(async () => {
        await markApprovalStatus(id, 'Rejected', {
          justification: reason || 'Rejected',
          reviewedBy: userId
        });
        if (['transaction_deposit', 'transaction_withdraw'].includes(request.type)) {
          await cancelPendingTransactionForApproval(id, reason || 'Rejected');
        }
        return executeRejectedAction({
          ...request,
          status: 'Rejected',
          reviewed_by: userId
        }, reason);
      });

      try {
        if (['transaction_deposit', 'transaction_withdraw'].includes(request.type)) {
          const details = parseRequestDetails(request);
          const accountId = details.accountId || details.account_id || details.savings_account_id || request.entity_id;
          const clientId = details.client_id || details.clientId || null;
          if (clientId) {
            const procType = request.type === 'transaction_deposit' ? 'deposit_rejected' : 'withdrawal_rejected';
            notifyClientProcess(clientId, procType, {
              accountId,
              amount: details.amount || request.amount || 0,
              reason: reason || 'Not specified'
            });
          }
        }
      } catch (e) {
        console.warn('Transaction rejection customer email failed:', e?.message || e);
      }

      recordAuditEvent({
        action: 'APPROVAL_REJECTED',
        entityType: 'approval_request',
        entityId: id,
        user: req.user,
        details: { amount: request.amount, type: request.type, reason: reason || 'Rejected' }
      }).catch(() => {});
      console.log(`[AUDIT] Approval request ${id} rejected by ${userRole} (ID: ${userId}) at ${new Date().toISOString()}`);

      notifyApprovalRequester({
        requestId: id,
        type: request.type,
        requestedBy: request.requested_by,
        approved: false,
        reason: reason || 'Not specified'
      }).catch(() => {});

      return res.json({
        message: 'Request rejected successfully',
        execution: result || null
      });
    } catch (executionError) {
      if (executionError.statusCode === 409) {
        return res.status(409).json({
          error: executionError.message,
          code: executionError.code || 'APPROVAL_ALREADY_PROCESSED'
        });
      }
      console.error('Approval rejection error:', executionError);
      return res.status(500).json({ error: executionError.message || 'Failed to reject request' });
    }
  });
});

async function executeApprovedAction(request) {
  if (request.type === 'transaction_deposit' || request.type === 'transaction_withdraw') {
    return executeApprovedTransaction(request);
  }

  if (request.type === 'account_creation') {
    return executeApprovedAccountCreation(request);
  }

  if (request.type === 'savings_account_approval') {
    return executeApprovedSavingsAccount(request);
  }

  if (request.type === 'loan_origination') {
    return executeApprovedLoan(request);
  }

  if (request.type === 'statement_approval') {
    return executeApprovedStatementRequest(request);
  }

  return null;
}

async function executeRejectedAction(request, reason) {
  if (request.type === 'account_creation') {
    return executeRejectedAccountCreation(request, reason);
  }

  if (request.type === 'savings_account_approval') {
    return executeRejectedSavingsAccount(request, reason);
  }

  if (request.type === 'loan_origination') {
    return executeRejectedLoan(request, reason);
  }

  if (request.type === 'statement_approval') {
    return executeRejectedStatementRequest(request, reason);
  }

  return null;
}

async function executeApprovedStatementRequest(request) {
  const statementId = request.entity_id;
  const statement = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM statements WHERE id = ?', [statementId], (err, row) => (err ? reject(err) : resolve(row || null)));
  });

  if (!statement) {
    throw new Error(`Statement ${statementId} not found for approval execution`);
  }

  if (statement.status === 'Finalized') {
    return { statement_id: statementId, status: 'Finalized' };
  }

  await new Promise((resolve, reject) => {
    db.run("UPDATE statements SET status = 'Approved' WHERE id = ?", [statementId], (err) => (err ? reject(err) : resolve()));
  });

  return { statement_id: statementId, status: 'Approved' };
}

async function executeRejectedStatementRequest(request, reason) {
  const statementId = request.entity_id;
  const statement = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM statements WHERE id = ?', [statementId], (err, row) => (err ? reject(err) : resolve(row || null)));
  });

  if (!statement) {
    throw new Error(`Statement ${statementId} not found for rejection execution`);
  }

  await new Promise((resolve, reject) => {
    db.run("UPDATE statements SET status = 'Rejected' WHERE id = ?", [statementId], (err) => (err ? reject(err) : resolve()));
  });

  return { statement_id: statementId, status: 'Rejected', reason: reason || 'Rejected' };
}

// Execute approved transaction
async function executeApprovedTransaction(request) {
  const existing = await runGet(
    `SELECT id, transaction_type, amount, account_id, status, balance_before, balance_after
     FROM transactions WHERE approval_request_id = ? LIMIT 1`,
    [request.id]
  );
  if (existing && existing.status === 'Completed') {
    return {
      transaction_id: existing.id,
      account_id: existing.account_id,
      transaction_type: existing.transaction_type,
      duplicate: true
    };
  }

  const details = parseRequestDetails(request);

  if (request.type === 'transaction_deposit') {
    const accountId = details.accountId || details.account_id || details.savings_account_id;
    const amount = details.amount;
    const description = details.description;
    
    const account = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, amount AS balance, status, client_id, 'savings_accounts' AS source_table
         FROM savings_accounts
         WHERE id = ?`,
        [accountId],
        (err, row) => {
        if (err) reject(err);
        else resolve(row);
        }
      );
    });
    
    if (account) {
      const balanceBefore = Number(account.balance || 0);
      const balanceAfter = balanceBefore + Number(amount);
      const updateSql = 'UPDATE savings_accounts SET amount = ? WHERE id = ?';
      
      await new Promise((resolve, reject) => {
        db.run(updateSql, [balanceAfter, accountId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const transactionId = existing?.id || generateApprovalId();
      if (existing && (existing.status === 'Pending Approval' || existing.status === 'Pending')) {
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE transactions
             SET balance_before = ?, balance_after = ?, description = ?, status = 'Completed'
             WHERE id = ?`,
            [balanceBefore, balanceAfter, description || 'Deposit (Approved)', transactionId],
            (err) => (err ? reject(err) : resolve())
          );
        });
      } else if (!existing) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO transactions
             (id, account_id, account_type, transaction_type, amount, balance_before, balance_after, description, approval_request_id, status)
             VALUES (?, ?, 'savings', 'deposit', ?, ?, ?, ?, ?, 'Completed')`,
            [transactionId, accountId, amount, balanceBefore, balanceAfter, description || 'Deposit (Approved)', request.id],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
      await safeRecordAudit({
        action: 'APPROVED_DEPOSIT_EXECUTED',
        entityType: 'transaction',
        entityId: transactionId,
        user: { id: request.reviewed_by, role: 'checker' },
        beforeState: { accountId, balance: balanceBefore },
        afterState: { accountId, balance: balanceAfter },
        details: { approval_request_id: request.id }
      }, 'approved_deposit_executed');
      emitBalanceUpdated({ savingsAccountId: accountId, balance: balanceAfter });
      try {
        const { recordGrowthTermDeposit } = require('../utils/growthTermDeposits');
        await recordGrowthTermDeposit(accountId, Number(amount || 0));
      } catch (growthErr) {
        console.warn('Growth Term deposit tracking failed:', growthErr?.message || growthErr);
      }
      const depositClient = await runGet('SELECT name, email FROM clients WHERE id = ?', [account.client_id]);
      if (depositClient?.email) {
        fireAndForgetEmail(() => sendDepositSuccessEmail({
          email: depositClient.email,
          name: depositClient.name,
          accountId,
          amount,
          balanceAfter,
          transactionId
        }));
      }
      const receiptDocId = details.receipt_document_id || details.receiptDocId || null;
      if (receiptDocId) {
        await markReceiptDocumentConsumed(receiptDocId, { approvalRequestId: request.id, transactionId });
      }
      return {
        transaction_id: transactionId,
        account_id: accountId,
        transaction_type: 'deposit'
      };
    }
  } else if (request.type === 'transaction_withdraw') {
    const accountId = details.accountId || details.account_id || details.savings_account_id;
    const amount = details.amount;
    const description = details.description;
    
    const account = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, amount AS balance, status, client_id, 'savings_accounts' AS source_table
         FROM savings_accounts
         WHERE id = ?`,
        [accountId],
        (err, row) => {
        if (err) reject(err);
        else resolve(row);
        }
      );
    });
    
    if (account) {
      const balanceBefore = Number(account.balance || 0);
      const balanceAfter = balanceBefore - Number(amount);
      const updateSql = 'UPDATE savings_accounts SET amount = ? WHERE id = ?';
      
      await new Promise((resolve, reject) => {
        db.run(updateSql, [balanceAfter, accountId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const transactionId = generateApprovalId();
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO transactions (id, account_id, account_type, transaction_type, amount, balance_before, balance_after, description, approval_request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [transactionId, accountId, 'savings', 'withdraw', amount, balanceBefore, balanceAfter, description || 'Withdrawal (Approved)', request.id],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      await safeRecordAudit({
        action: 'APPROVED_WITHDRAWAL_EXECUTED',
        entityType: 'transaction',
        entityId: transactionId,
        user: { id: request.reviewed_by, role: 'checker' },
        beforeState: { accountId, balance: balanceBefore },
        afterState: { accountId, balance: balanceAfter },
        details: { approval_request_id: request.id }
      }, 'approved_withdrawal_executed');
      emitBalanceUpdated({ savingsAccountId: accountId, balance: balanceAfter });
      const withdrawClient = await runGet('SELECT name, email FROM clients WHERE id = ?', [account.client_id]);
      if (withdrawClient?.email) {
        fireAndForgetEmail(() => sendWithdrawalSuccessEmail({
          email: withdrawClient.email,
          name: withdrawClient.name,
          accountId,
          amount,
          balanceAfter,
          transactionId
        }));
      }
      return {
        transaction_id: transactionId,
        account_id: accountId,
        transaction_type: 'withdraw'
      };
    }
  }

  return null;
}

async function executeApprovedAccountCreation(request) {
  const details = parseRequestDetails(request);
  const accountId = request.entity_id;
  const sourceTable = 'savings_accounts';
  const balanceColumn = 'amount';

  const account = await new Promise((resolve, reject) => {
    db.get(
      `SELECT a.*, c.name AS client_name, c.kyc_status, c.id_number, c.income_source
       FROM ${sourceTable} a
       JOIN clients c ON c.id = a.client_id
       WHERE a.id = ?`,
      [accountId],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });

  if (!account) {
    throw new Error(`Account ${accountId} could not be found for approval execution`);
  }

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE ${sourceTable}
       SET status = 'Active'
       WHERE id = ?`,
      [accountId],
      (err) => (err ? reject(err) : resolve())
    );
  });

  const openingBalance = Number(details.opening_balance || details.initial_balance || account[balanceColumn] || 0);
  if (openingBalance > 0) {
    const existingTransaction = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id
         FROM transactions
         WHERE account_id = ? AND account_type = 'savings' AND transaction_type = 'deposit'
         ORDER BY created_at ASC
         LIMIT 1`,
        [accountId],
        (err, row) => (err ? reject(err) : resolve(row || null))
      );
    });

    if (!existingTransaction) {
      const transactionId = generateApprovalId();
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO transactions
           (id, account_id, account_type, transaction_type, amount, balance_before, balance_after, description, approval_request_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transactionId,
            accountId,
            'savings',
            'deposit',
            openingBalance,
            0,
            openingBalance,
            'Opening balance approved',
            request.id,
            request.reviewed_by || null
          ],
          (err) => {
            if (err) {
              reject(err);
            } else {
              // Send opening balance confirmation email
              try {
                db.get('SELECT name, email FROM clients WHERE id = ?', [account.client_id], (queryErr, client) => {
                  if (!queryErr && client && client.email) {
                    fireAndForgetEmail(() => sendDepositSuccessEmail({
                      email: client.email,
                      name: client.name,
                      accountId: accountId,
                      amount: openingBalance,
                      balanceAfter: openingBalance,
                      transactionId: transactionId
                    }));
                  }
                });
              } catch (e) {
                console.warn('Failed to send opening balance email:', e && e.message);
              }
              resolve();
            }
          }
        );
      });
    }
  }

  await safeRecordAudit({
    action: 'ACCOUNT_CREATION_APPROVED',
    entityType: 'account',
    entityId: accountId,
    user: { id: request.reviewed_by, role: 'checker' },
    beforeState: { status: account.status },
    afterState: { status: 'Active' },
    details: {
      approval_request_id: request.id,
      client_id: account.client_id,
      client_name: account.client_name,
      requested_type: details.account_type || account.type
    }
  }, 'account_creation_approved');

  // Ensure client user credentials exist and persist/send generated credentials if created
  try {
    await ensureRegistrationRequestCredentialColumns();
  } catch (e) {
    // best-effort, ignore schema alteration failures
  }

  try {
    const clientRow = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clients WHERE id = ?', [account.client_id], (err, row) => (err ? reject(err) : resolve(row)));
    });

    if (clientRow) {
      const { username, temporaryPassword, created } = await ensureClientUserCredentials(clientRow);
      if (created && username && temporaryPassword) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE client_registration_requests SET generated_username = ?, generated_temporary_password = ?, credentials_sent_at = ? WHERE client_id = ?',
            [username, temporaryPassword, new Date().toISOString(), clientRow.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        if (clientRow.email) {
          const subject = 'Your Edekise Microfinance Account Credentials';
          const text = `Dear ${clientRow.name},\n\nYour account has been approved and your client portal account is ready.\n\nUsername: ${username}\nTemporary password: ${temporaryPassword}\n\nPlease change your password after first login.\n\nRegards,\nEdekise Microfinance Team`;
          try {
            await sendEmail(clientRow.email, subject, text);
          } catch (e) {
            console.warn('Failed to send credentials email:', e && e.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Credential creation on approval failed:', e && e.message);
  }
  return {
    account_id: accountId,
    client_id: account.client_id,
    status: 'Active'
  };
}

async function executeRejectedAccountCreation(request, reason) {
  const accountId = request.entity_id;
  const sourceTable = 'savings_accounts';

  await new Promise((resolve, reject) => {
    const updateSql = "UPDATE savings_accounts SET status = 'Rejected' WHERE id = ?";
    db.run(updateSql, [accountId], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });

  await safeRecordAudit({
    action: 'ACCOUNT_CREATION_REJECTED',
    entityType: 'account',
    entityId: accountId,
    user: { id: request.reviewed_by, role: 'checker' },
    beforeState: { status: 'Pending' },
    afterState: { status: 'Rejected' },
    details: { reason, approval_request_id: request.id }
  }, 'account_creation_rejected');

  try {
    const account = await new Promise((resolve, reject) => {
      db.get('SELECT client_id FROM savings_accounts WHERE id = ?', [accountId], (err, row) => (err ? reject(err) : resolve(row || null)));
    });
    if (account?.client_id) {
      await safeSendClientEmail({
        clientId: account.client_id,
        subject: `Savings Account Opening Rejected - ${accountId}`,
        text: `Dear client,\n\nYour savings account opening request (${accountId}) was rejected.\nReason: ${reason || 'Not specified'}\n\nPlease contact the branch for guidance.\n\nEdekise Microfinance`,
        category: 'account_opening_rejected',
        metadata: { approval_request_id: request.id, account_id: accountId }
      });
    }
  } catch (e) {
    console.warn('Account creation rejection email failed:', e?.message || e);
  }

  return { account_id: accountId, status: 'Rejected', reason };
}

// Execute approved savings account
async function executeApprovedSavingsAccount(request) {
  const { entity_id: savingsId } = request;

  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE savings_accounts SET status = 'Active', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
      [request.reviewed_by, savingsId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const savings = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM savings_accounts WHERE id = ?', [savingsId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    const { initializeGrowthTermAccount } = require('../utils/growthTermDeposits');
    await initializeGrowthTermAccount(savings);
  } catch (growthErr) {
    console.warn('Growth Term initialization failed:', growthErr?.message || growthErr);
  }

  await safeRecordAudit({
    action: 'SAVINGS_ACCOUNT_APPROVED',
    entityType: 'savings_account',
    entityId: savingsId,
    user: { id: request.reviewed_by, role: 'branch_manager' },
    beforeState: { status: 'Pending Manager Review' },
    afterState: { status: 'Active' },
    details: { approval_request_id: request.id, client_id: savings.client_id }
  }, 'savings_account_approved');

  // Create notification for client
  const client = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM clients WHERE id = ?', [savings.client_id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (client) {
    try {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [client.user_id, 'approval', 'Savings Account Approved', `Your savings account ${savingsId} has been approved and is now active.`, 'savings_account', savingsId, new Date().toISOString()],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (notificationError) {
      console.warn('Savings approval notification write failed:', notificationError?.message || notificationError);
    }
  }

  if (client?.id) {
    await safeSendClientEmail({
      clientId: client.id,
      subject: `Savings Account Approved - ${savingsId}`,
      text: `Dear ${client.name || 'client'},\n\nYour savings account ${savingsId} has been approved and is now active.\n\nEdekise Microfinance`,
      category: 'savings_account_approved',
      metadata: { approval_request_id: request.id, savings_account_id: savingsId }
    });
  }

  // Ensure client has user credentials and send them when created
  try {
    await ensureRegistrationRequestCredentialColumns();
  } catch (e) {
    // ignore
  }

  try {
    if (client) {
      const { username, temporaryPassword, created } = await ensureClientUserCredentials(client);
      if (created && username && temporaryPassword) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE client_registration_requests SET generated_username = ?, generated_temporary_password = ?, credentials_sent_at = ? WHERE client_id = ?',
            [username, temporaryPassword, new Date().toISOString(), client.id],
            (err) => (err ? reject(err) : resolve())
          );
        });

        if (client.email) {
          const subject = 'Your Edekise Microfinance Account Credentials';
          const text = `Dear ${client.name},\n\nYour savings account has been approved and your client portal account is ready.\n\nUsername: ${username}\nTemporary password: ${temporaryPassword}\n\nPlease change your password after first login.\n\nRegards,\nEdekise Microfinance Team`;
          try {
            await sendEmail(client.email, subject, text);
          } catch (e) {
            console.warn('Failed to send credentials email:', e && e.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Credential creation on savings approval failed:', e && e.message);
  }

  return { savings_id: savingsId, status: 'Active', client_id: savings.client_id };
}

// Execute rejected savings account
async function executeRejectedSavingsAccount(request, reason) {
  const { entity_id: savingsId } = request;

  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE savings_accounts SET status = 'Rejected', rejection_reason = ? WHERE id = ?",
      [reason, savingsId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await safeRecordAudit({
    action: 'SAVINGS_ACCOUNT_REJECTED',
    entityType: 'savings_account',
    entityId: savingsId,
    user: { id: request.reviewed_by, role: 'branch_manager' },
    beforeState: { status: 'Pending Manager Review' },
    afterState: { status: 'Rejected' },
    details: { reason, approval_request_id: request.id }
  }, 'savings_account_rejected');

  try {
    const savings = await new Promise((resolve, reject) => {
      db.get('SELECT client_id FROM savings_accounts WHERE id = ?', [savingsId], (err, row) => (err ? reject(err) : resolve(row || null)));
    });
    if (savings?.client_id) {
      await safeSendClientEmail({
        clientId: savings.client_id,
        subject: `Savings Account Rejected - ${savingsId}`,
        text: `Dear client,\n\nYour savings account request (${savingsId}) was rejected.\nReason: ${reason || 'Not specified'}\n\nPlease contact the branch if you need help.\n\nEdekise Microfinance`,
        category: 'savings_account_rejected',
        metadata: { approval_request_id: request.id, savings_account_id: savingsId }
      });
    }
  } catch (e) {
    console.warn('Savings rejection email failed:', e?.message || e);
  }

  return { savings_id: savingsId, status: 'Rejected', reason };
}

// Execute approved loan
async function executeApprovedLoan(request) {
  const { entity_id: loanId } = request;
  const details = parseRequestDetails(request);

  // Get loan details
  const loan = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM loan_accounts WHERE id = ?', [loanId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!loan) {
    throw new Error('Loan not found');
  }

  // Check savings account status and balance
  const savingsAccount = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM savings_accounts WHERE id = ?', [loan.savings_account_id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!savingsAccount) {
    throw new Error('Linked savings account not found');
  }

  if (savingsAccount.status !== 'Active') {
    throw new Error('Linked savings account is not active');
  }

  // Verify group guarantee if client belongs to a group
  if (savingsAccount.group_id) {
    const group = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM groups WHERE id = ?', [savingsAccount.group_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!group || group.status !== 'Active') {
      throw new Error('Client group is not active');
    }

    // Verify guarantors
    const guarantors = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM loan_guarantors WHERE loan_id = ?', [loanId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (guarantors.length === 0) {
      throw new Error('Group loan requires at least one guarantor');
    }

    // Verify each guarantor is active and in the same group
    for (const guarantor of guarantors) {
      const guarantorClient = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM clients WHERE id = ?', [guarantor.guarantor_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!guarantorClient || guarantorClient.status !== 'Active') {
        throw new Error(`Guarantor ${guarantor.guarantor_id} is not active`);
      }

      if (guarantorClient.group_id !== savingsAccount.group_id) {
        throw new Error(`Guarantor ${guarantor.guarantor_id} is not in the same group`);
      }
    }
  }

  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE loan_accounts SET status = 'Active', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?",
      [request.reviewed_by, loanId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Disburse loan amount to savings account
  const transactionId = `TXN-${Date.now()}-DISB`;
  const savingsBalanceBefore = savingsAccount.amount;
  const savingsBalanceAfter = savingsBalanceBefore + loan.amount;

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE savings_accounts SET amount = ? WHERE id = ?',
      [savingsBalanceAfter, loan.savings_account_id],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Create transaction record for disbursement
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO transactions (id, account_id, account_type, transaction_type, amount, balance_before, balance_after, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [transactionId, loan.savings_account_id, 'savings', 'disbursement', loan.amount, savingsBalanceBefore, savingsBalanceAfter, `Loan disbursement for ${loanId}`, request.reviewed_by, new Date().toISOString()],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Update loan disbursement date
  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE loan_accounts SET disbursement_date = ? WHERE id = ?',
      [new Date().toISOString().split('T')[0], loanId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await safeRecordAudit({
    action: 'LOAN_APPROVED',
    entityType: 'loan_account',
    entityId: loanId,
    user: { id: request.reviewed_by, role: 'branch_manager' },
    beforeState: { status: 'Pending Branch Manager Review' },
    afterState: { status: 'Active' },
    details: { approval_request_id: request.id, client_id: loan.client_id, amount: loan.amount }
  }, 'loan_approved');
  emitLoanUpdated({ loanId, status: 'Active', balance: Number(loan.amount || 0) });
  emitBalanceUpdated({ savingsAccountId: loan.savings_account_id, balance: savingsBalanceAfter });

  // Create notification for client
  const client = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM clients WHERE id = ?', [loan.client_id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (client) {
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [client.user_id, 'approval', 'Loan Application Approved', `Your loan application ${loanId} for ${loan.amount} ETB has been approved and is now active.`, 'loan_account', loanId, new Date().toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    if (client.email) {
      try {
        await sendLoanApprovalEmail({
          ...loan,
          client_name: client.name || loan.client_name,
          client_email: client.email
        });
      } catch (emailError) {
        console.warn('Loan approval email failed:', emailError?.message || emailError);
      }
    }
  }

  return { loan_id: loanId, status: 'Active', client_id: loan.client_id, amount: loan.amount };
}

// Execute rejected loan
async function executeRejectedLoan(request, reason) {
  const { entity_id: loanId } = request;

  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE loan_accounts SET status = 'Rejected', rejection_reason = ? WHERE id = ?",
      [reason, loanId],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await safeRecordAudit({
    action: 'LOAN_REJECTED',
    entityType: 'loan_account',
    entityId: loanId,
    user: { id: request.reviewed_by, role: 'branch_manager' },
    beforeState: { status: 'Pending Branch Manager Review' },
    afterState: { status: 'Rejected' },
    details: { reason, approval_request_id: request.id }
  }, 'loan_rejected');
  emitLoanUpdated({ loanId, status: 'Rejected' });

  const loan = await new Promise((resolve, reject) => {
    db.get(
      `SELECT la.*, c.name AS client_name, c.email AS client_email
       FROM loan_accounts la
       LEFT JOIN clients c ON c.id = la.client_id
       WHERE la.id = ?`,
      [loanId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });

  if (loan?.client_email) {
    try {
      await sendLoanRejectionEmail(loan, reason);
    } catch (emailError) {
      console.warn('Loan rejection email failed:', emailError?.message || emailError);
    }
  }

  return { loan_id: loanId, status: 'Rejected', reason };
}

// Get approval thresholds (for UI)
router.get('/thresholds', authenticateToken, (req, res) => {
  res.json(APPROVAL_THRESHOLDS);
});

const assertNoDuplicatePendingApproval = async ({ type, entityId, requestedBy }) => {
  const existing = await runGet(
    `SELECT id FROM approval_requests
     WHERE type = ? AND entity_id = ? AND requested_by = ? AND status = 'Pending'
     ORDER BY created_at DESC LIMIT 1`,
    [type, entityId, requestedBy]
  );
  if (existing) {
    const error = new Error('A pending request already exists for this account. Cancel it or wait for review before submitting again.');
    error.statusCode = 409;
    error.code = 'DUPLICATE_PENDING_APPROVAL';
    error.approval_request_id = existing.id;
    throw error;
  }
};

module.exports = router;
module.exports.createApprovalRequest = createApprovalRequest;
module.exports.getApprovalLevel = getApprovalLevel;
module.exports.assertNoDuplicatePendingApproval = assertNoDuplicatePendingApproval;
