const { db } = require('../config/database');
const { createApprovalRequest } = require('../routes/approvals');
const { evaluateLoanSavingsRequirement } = require('./loanSavingsRequirement');
const { generateLoanAccountNumber } = require('./loanWorkflow');
const { assertUniqueActiveLoanType } = require('./productUniqueness');
const { withTransaction } = require('./transactionWrapper');
const { notifyClientProcess } = require('./processEmails');

const LOAN_TYPE_RATES = {
  'Micro Enterprise Loan': Number(process.env.LOAN_RATE_MICRO_ENTERPRISE || 8),
  'Individual Business Loan': Number(process.env.LOAN_RATE_INDIVIDUAL_BUSINESS || 7.5),
  'Consumption Loan': Number(process.env.LOAN_RATE_CONSUMPTION || 9)
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

const pickLoanTypeForAmount = (amount) => {
  if (amount >= 100000) return 'Consumption Loan';
  if (amount >= 50000) return 'Micro Enterprise Loan';
  return 'Individual Business Loan';
};

/**
 * Start loan workflow from an approved registration when savings collateral rules are already met.
 */
async function tryCreateRegistrationLoan({ client, requestedAmount, reviewedByUserId }) {
  const loanAmount = Number(requestedAmount || 0);
  if (!client?.id || !Number.isFinite(loanAmount) || loanAmount <= 0) {
    return { created: false, reason: 'no_requested_loan' };
  }

  const savings = await runGet(
    `SELECT * FROM savings_accounts
     WHERE client_id = ? AND status = 'Active'
     ORDER BY amount DESC
     LIMIT 1`,
    [client.id]
  );

  if (!savings) {
    return { created: false, reason: 'active_savings_required' };
  }

  const evaluation = await evaluateLoanSavingsRequirement({
    savingsAccount: savings,
    loanAmount,
    clientId: client.id,
    documentIds: []
  });

  if (!evaluation.eligible) {
    return {
      created: false,
      reason: 'requirements_not_met',
      savings_requirement: evaluation
    };
  }

  const loanType = pickLoanTypeForAmount(loanAmount);

  try {
    await assertUniqueActiveLoanType(client.id, loanType);
  } catch (duplicateError) {
    return { created: false, reason: duplicateError.message || 'duplicate_loan_type' };
  }

  const loanId = generateLoanAccountNumber();
  const interestRate = LOAN_TYPE_RATES[loanType] || 8;
  const termMonths = loanAmount >= 50000 ? 12 : 12;
  let approvalRequestId = null;

  await withTransaction(async () => {
    await runExec(
      `INSERT INTO loan_accounts
       (id, client_id, savings_account_id, amount, balance, type, term, interest_rate, payment_frequency, status, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loanId,
        client.id,
        savings.id,
        loanAmount,
        loanAmount,
        loanType,
        String(termMonths),
        interestRate,
        'Monthly',
        'Pending Branch Manager Review',
        'Registration loan request'
      ]
    );

    approvalRequestId = await createApprovalRequest(
      'loan_origination',
      loanId,
      loanAmount,
      reviewedByUserId,
      {
        client_id: client.id,
        client_name: client.name,
        savings_account_id: savings.id,
        source: 'registration',
        registration_priority: true,
        principal: loanAmount,
        interest_rate: interestRate,
        term_months: termMonths,
        payment_frequency: 'Monthly'
      }
    );
  });

  notifyClientProcess(client.id, 'loan_application_submitted', {
    referenceId: loanId,
    amount: loanAmount
  }).catch(() => {});

  return {
    created: true,
    loan_id: loanId,
    approval_request_id: approvalRequestId,
    loan_type: loanType
  };
}

module.exports = { tryCreateRegistrationLoan };
