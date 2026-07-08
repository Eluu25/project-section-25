const express = require('express');
const router = express.Router();
const { testEmailConfig, sendEmail } = require('../utils/emailService');

// Development-only endpoints to inspect in-memory product definitions
const savingsModule = require('./savings');
// Inline loan type metadata (duplicate of backend policy) — dev-only
const LOAN_TYPE_RULES = {
  'Micro Enterprise Loan': Number(process.env.LOAN_RATE_MICRO_ENTERPRISE || 8),
  'Individual Business Loan': Number(process.env.LOAN_RATE_INDIVIDUAL_BUSINESS || 7.5),
  'Consumption Loan': Number(process.env.LOAN_RATE_CONSUMPTION || 9),
  'Construction Loan': Number(process.env.LOAN_RATE_CONSTRUCTION || 12),
  'Agricultural Business Loan': Number(process.env.LOAN_RATE_AGRICULTURAL_BUSINESS || 10)
};

const LOAN_TYPE_META = {
  'Micro Enterprise Loan': { min_amount: 50000, max_amount: 90000, repayment_min_months: 12, repayment_max_months: 24, description: 'Small business support' },
  'Individual Business Loan': { min_amount: 10000, max_amount: 50000, repayment_min_months: 1, repayment_max_months: 1, description: 'Short-term business loan' },
  'Consumption Loan': { min_amount: 10000, max_amount: 100000, organization_letter_required: true, description: 'Personal use loan' },
  'Construction Loan': { min_amount: 100000, max_amount: 500000, description: 'Housing/construction financing' },
  'Agricultural Business Loan': { min_amount: 100000, max_amount: 300000, description: 'Farming/agriculture support' }
};

router.get('/savings-options', (req, res) => {
  res.json(savingsModule.SAVINGS_OPTIONS || []);
});

router.get('/loan-types', (req, res) => {
  res.json({ rules: LOAN_TYPE_RULES, meta: LOAN_TYPE_META });
});

// Development: list users (id, username, role) to help debug login issues
router.get('/users', (req, res) => {
  try {
    const { db } = require('../config/database');
    db.all('SELECT id, username, role FROM users LIMIT 100', [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to query users', details: err.message });
      res.json({ users: rows || [] });
    });
  } catch (error) {
    res.status(500).json({ error: 'Dev route error', details: error.message });
  }
});

router.get('/email/status', async (req, res) => {
  const brevoCheck = await testEmailConfig();
  res.json({
    provider: 'brevo',
    configured: Boolean(process.env.BREVO_API_KEY),
    senderEmail: process.env.BREVO_SENDER_EMAIL || null,
    senderName: process.env.BREVO_SENDER_NAME || null,
    verify: brevoCheck
  });
});

router.post('/email/test', async (req, res) => {
  const {
    to,
    subject = 'Edekise email test',
    message = 'This is a development email test from Edekise Microfinance.'
  } = req.body || {};

  if (!to) {
    return res.status(400).json({ error: 'Recipient email is required' });
  }

  try {
    const result = await sendEmail(
      to,
      subject,
      message,
      `<p>${String(message).replace(/\n/g, '<br/>')}</p>`
    );

    return res.json({
      result,
      hint: result.success
        ? 'Check inbox and spam folder.'
        : 'Fix BREVO_API_KEY in .env (401 = invalid key). Verify sender in Brevo → Senders.'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Email test failed'
    });
  }
});

module.exports = router;
