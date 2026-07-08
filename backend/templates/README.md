# Email templates

HTML layouts are built programmatically in `utils/emailTemplates.js` using `wrapEmailLayout()`.

## Structure

- **Header** — Edekise Microfinance branding (gradient bar)
- **Body** — Per-event content (tables, CTAs)
- **Footer** — Copyright + client portal link

## Adding a new process email

1. Add `buildYourEventEmail(data)` in `utils/emailTemplates.js` returning `{ subject, text, html }`.
2. Register the process key in `utils/processEmails.js` → `PROCESS_BUILDERS`.
3. From routes, call `notifyProcess('your_process_key', { email, ...data })` or `notifyClientProcess(clientId, 'your_process_key', data)` so API responses are never blocked.

### Process keys (examples)

| Key | When |
|-----|------|
| `registration_submitted` | Public client registration |
| `deposit_pending` / `withdrawal_pending` | Client/staff submits transaction for approval |
| `deposit_success` / `withdrawal_success` | Transaction posted |
| `deposit_rejected` / `withdrawal_rejected` | Approver rejects transaction |
| `approval_pending_staff` | New approval for branch manager / CEO |
| `approval_decision` | Requester notified of approve/reject |
| `request_cancelled` | Pending approval cancelled |
| `loan_application_submitted` | Loan submitted for review |
| `loan_approved` / `loan_rejected` | Loan decision |
| `kyc_verified` / `kyc_rejected` | KYC outcome |
| `contact_acknowledgement` | Contact form received |

## Environment

Set in `.env`:

- `BREVO_API_KEY` — required (Brevo → SMTP & API → API Keys)
- `BREVO_SENDER_EMAIL` — verified sender in Brevo
- `BREVO_SENDER_NAME` — display name
