/**
 * Routes customer compliance messages to the correct management level.
 */

const { db } = require('../config/database');
const { sendEmail } = require('./emailService');

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const ROUTING_RULES = [
  {
    roles: ['ceo', 'admin'],
    categories: ['fraud', 'aml', 'compliance', 'regulatory', 'executive', 'escalation'],
    level: 'executive'
  },
  {
    roles: ['ceo'],
    categories: ['high_value', 'high-value', 'ceo'],
    level: 'ceo'
  },
  {
    roles: ['branch_manager', 'admin'],
    categories: ['branch', 'service', 'account', 'loan', 'savings', 'transaction', 'complaint'],
    level: 'branch'
  },
  {
    roles: ['admin'],
    categories: ['general', 'feedback', 'inquiry', 'other'],
    level: 'admin'
  }
];

const normalizeCategory = (category) => String(category || 'complaint').trim().toLowerCase();

const resolveComplianceRoute = (category) => {
  const normalized = normalizeCategory(category);

  for (const rule of ROUTING_RULES) {
    if (rule.categories.some((key) => normalized.includes(key))) {
      return {
        notifyRoles: [...new Set(rule.roles)],
        assignedRole: rule.roles[0],
        escalationLevel: rule.level
      };
    }
  }

  return {
    notifyRoles: ['admin', 'branch_manager'],
    assignedRole: 'branch_manager',
    escalationLevel: 'branch'
  };
};

const roleCanAccessMessage = (userRole, assignedRole, escalationLevel) => {
  const role = String(userRole || '').toLowerCase();
  if (role === 'admin') return true;
  if (role === 'ceo' && (assignedRole === 'ceo' || escalationLevel === 'executive' || escalationLevel === 'ceo')) {
    return true;
  }
  if (role === 'branch_manager' && (assignedRole === 'branch_manager' || escalationLevel === 'branch')) {
    return true;
  }
  return false;
};

/**
 * Notify the management level resolved for a compliance category (best-effort email).
 */
const notifyComplianceEscalation = async ({
  category = 'compliance',
  subject,
  body,
  referenceId
}) => {
  const route = resolveComplianceRoute(category);
  const subjectLine = subject || `[${route.escalationLevel.toUpperCase()}] Compliance item (${category})`;
  const messageBody = [
    referenceId ? `Reference: ${referenceId}` : null,
    `Routed to: ${route.notifyRoles.join(', ')}`,
    `Escalation level: ${route.escalationLevel}`,
    `Category: ${category}`,
    '',
    body || ''
  ].filter(Boolean).join('\n');

  try {
    const rolePlaceholders = route.notifyRoles.map(() => '?').join(',');
    const recipients = await runAll(
      `SELECT email, role FROM users
       WHERE role IN (${rolePlaceholders})
         AND email IS NOT NULL
         AND trim(email) != ''`,
      route.notifyRoles
    );
    for (const recipient of recipients) {
      if (!recipient?.email) continue;
      await sendEmail(recipient.email, subjectLine, messageBody);
    }
    return route;
  } catch (error) {
    console.error('Compliance escalation notification error:', error);
    return route;
  }
};

module.exports = {
  resolveComplianceRoute,
  roleCanAccessMessage,
  normalizeCategory,
  notifyComplianceEscalation
};
