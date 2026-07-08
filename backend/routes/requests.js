const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const getSavingsAccountContext = (accountId) => new Promise((resolve, reject) => {
  db.get(
    `SELECT c.id AS client_id, c.name AS client_name, c.phone, s.id AS account_id, s.amount AS balance, s.status, 'savings_accounts' AS account_source
     FROM savings_accounts s
     JOIN clients c ON c.id = s.client_id
     WHERE s.id = ?`,
    [accountId],
    (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row || null);
      }
    }
  );
});

// Get all requests
router.get('/', authenticateToken, authorizeRoles('admin', 'branch_manager', 'saving_staff'), (req, res) => {
  db.all('SELECT * FROM requests ORDER BY submitted_date DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching requests:', err);
      return res.status(500).json({ error: 'Failed to fetch requests' });
    }
    res.json(rows);
  });
});

// Create new request
router.post('/', authenticateToken, authorizeRoles('admin', 'branch_manager', 'saving_staff'), async (req, res) => {
  const accountId = req.body.accountId || req.body.account_id || req.body.account;
  const clientName = req.body.client || req.body.clientName;
  const requestType = req.body.requestType || req.body.type;
  const amount = req.body.amount;

  console.log('[REQUESTS] Incoming create request payload:', req.body);

  if (!accountId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const accountContext = await getSavingsAccountContext(accountId);
    console.log('[REQUESTS] Resolved account context:', accountContext);

    if (!accountContext) {
      return res.status(404).json({ error: 'Selected savings account could not be found' });
    }

    if (!['Active', 'Pending Manager Review', 'Pending'].includes(accountContext.status)) {
      return res.status(400).json({ error: 'Selected savings account is not available for new requests' });
    }

    const requestId = 'REQ-' + Date.now().toString().slice(-6);
    const submittedDate = new Date().toISOString().split('T')[0];
    const resolvedClientName = clientName || accountContext.client_name;
    const resolvedRequestType = requestType || 'Withdrawal Request';

    db.run(
      `INSERT INTO requests (id, client, account, type, amount, submitted_date, status, kyc_complete)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', 1)`,
      [requestId, resolvedClientName, accountContext.account_id, resolvedRequestType, parsedAmount, submittedDate],
      function(err) {
        if (err) {
          console.error('Error creating request:', err);
          return res.status(500).json({ error: 'Failed to create request' });
        }

        db.get('SELECT * FROM requests WHERE id = ?', [requestId], (lookupError, row) => {
          if (lookupError) {
            return res.status(500).json({ error: 'Failed to retrieve created request' });
          }
          res.status(201).json({ message: 'Request created successfully', request: row });
        });
      }
    );
  } catch (error) {
    console.error('Error validating request account:', error);
    res.status(500).json({ error: 'Failed to validate selected savings account' });
  }
});

const getRequestById = (id) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM requests WHERE id = ?', [id], (err, row) => (err ? reject(err) : resolve(row || null)));
});

// Cancel a pending staff request
router.post('/:id/cancel', authenticateToken, authorizeRoles('admin', 'branch_manager', 'saving_staff'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const request = await getRequestById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status === 'Cancelled') {
      return res.json({ message: 'Request is already cancelled', status: 'Cancelled' });
    }
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE requests SET status = ?, rejection_reason = ? WHERE id = ? AND status = ?',
        ['Cancelled', reason || 'Cancelled before approval', id, 'Pending'],
        function onCancel(err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Request was already processed'));
          else resolve();
        }
      );
    });

    res.json({ message: 'Request cancelled successfully', status: 'Cancelled' });
  } catch (error) {
    console.error('Error cancelling request:', error);
    if (error.message === 'Request was already processed') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// Approve request
router.post('/:id/approve', authenticateToken, authorizeRoles('admin', 'branch_manager'), async (req, res) => {
  const { id } = req.params;

  try {
    const request = await getRequestById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status === 'Cancelled') {
      return res.status(400).json({ error: 'Cannot approve a cancelled request' });
    }
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE requests SET status = ? WHERE id = ? AND status = ?',
        ['Approved', id, 'Pending'],
        function onApprove(err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Request was already processed'));
          else resolve();
        }
      );
    });

    res.json({ message: 'Request approved successfully' });
  } catch (error) {
    console.error('Error approving request:', error);
    if (error.message === 'Request was already processed') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Reject request
router.post('/:id/reject', authenticateToken, authorizeRoles('admin', 'branch_manager'), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  try {
    const request = await getRequestById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (request.status === 'Cancelled') {
      return res.status(400).json({ error: 'Request was already cancelled' });
    }
    if (request.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be rejected' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE requests SET status = ?, rejection_reason = ? WHERE id = ? AND status = ?',
        ['Rejected', reason.trim(), id, 'Pending'],
        function onReject(err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Request was already processed'));
          else resolve();
        }
      );
    });

    res.json({ message: 'Request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting request:', error);
    if (error.message === 'Request was already processed') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

module.exports = router;
