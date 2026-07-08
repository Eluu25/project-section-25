/**
 * Batch-replace common hardcoded UI strings with t('key') in pages/*.jsx
 * Only touches files that already destructure t from useLanguage().
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, '../src/pages');

const replacements = [
  ['>Cancel<', ">{t('cancel')}<"],
  ['>Close<', ">{t('close')}<"],
  ['>Approve<', ">{t('approve')}<"],
  ['>Reject<', ">{t('reject')}<"],
  ['>Save<', ">{t('save')}<"],
  ['>Search<', ">{t('search')}<"],
  ['>Loading…<', ">{t('loading')}<"],
  ['>Loading...<', ">{t('loading')}<"],
  ['Loading pending loans...', "{t('loading_pending_loans')}"],
  ['Loading approvals...', "{t('loading_approvals')}"],
  ['Loading approvals…', "{t('loading_approvals')}"],
  ['Loading approvals...', "{t('loading_approvals')}"],
  ['Loading clients...', "{t('loading_clients')}"],
  ['Loading clients…', "{t('loading_clients')}"],
  ['Loading audit logs...', "{t('loading_audit_logs')}"],
  ['Loading audit logs…', "{t('loading_audit_logs')}"],
  ['Loading compliance messages...', "{t('loading_compliance')}"],
  ['Loading compliance messages…', "{t('loading_compliance')}"],
  ['Loading user accounts...', "{t('loading_user_accounts')}"],
  ['Loading user accounts…', "{t('loading_user_accounts')}"],
  ['Loading linked documents…', "{t('loading_linked_documents')}"],
  ['Loading linked documents...', "{t('loading_linked_documents')}"],
  ['Loading documents...', "{t('loading_documents')}"],
  ['Loading documents…', "{t('loading_documents')}"],
  ['Loading review package...', "{t('loading_review_package')}"],
  ['Loading review package…', "{t('loading_review_package')}"],
  ['Loading settings...', "{t('loading_settings')}"],
  ['Loading settings…', "{t('loading_settings')}"],
  ['No pending approvals', "{t('no_pending_approvals')}"],
  ['No loan approvals found for the selected filters.', "{t('no_loan_approvals_filter')}"],
  ['No transactions found for the selected filters.', "{t('no_transactions_filter')}"],
  ['No messages matched your filters.', "{t('no_messages_filter')}"],
  ['No staff user accounts matched your search.', "{t('no_staff_users')}"],
  ['No clients matched your search.', "{t('no_clients_search')}"],
  ['No users match the current search and filters.', "{t('no_users_filter')}"],
  ['No archived users found.', "{t('no_archived_users')}"],
  ['No permissions assigned', "{t('no_permissions')}"],
  ['No AML alerts logged yet.', "{t('no_aml_alerts')}"],
  ['No audit activity available.', "{t('no_audit_activity')}"],
  ['No documents attached.', "{t('no_documents_attached')}"],
  ['No documents attached yet.', "{t('no_documents_yet')}"],
  ['No loan transactions yet.', "{t('no_loan_transactions')}"],
  ['No savings transactions.', "{t('no_savings_transactions')}"],
  ['No review data available.', "{t('no_review_data')}"],
  ['No receipt attached — approval will be blocked by the server.', "{t('no_receipt_blocked')}"],
  ['Reject Loan Application', "{t('modal_reject_loan')}"],
  ['Approve Loan Application', "{t('modal_approve_loan')}"],
  ['Approve Loan (CEO)', "{t('modal_approve_loan_ceo')}"],
  ['Approve Loan', "{t('confirm_approve_loan')}"],
  ['Manage Permissions', "{t('modal_manage_permissions')}"],
  ['Delete User', "{t('modal_delete_user')}"],
  ['Recent AML Alerts', "{t('recent_aml_alerts')}"],
  ['Recent Audit Activity', "{t('recent_audit_activity')}"],
  ['Reject Mismatch', "{t('reject_mismatch')}"],
  ['Approve Match', "{t('approve_match')}"],
  ['Review KYC', "{t('review_kyc')}"],
  ['Change password', "{t('change_password')}"],
  ['Change Password', "{t('change_password')}"],
  ['placeholder="Search loans..."', 'placeholder={t(\'search_loans\')}'],
  ['placeholder="Search clients..."', 'placeholder={t(\'search_clients\')}'],
  ['placeholder="Search logs..."', 'placeholder={t(\'search_logs\')}'],
  ['placeholder="Search users by name, email, or username..."', 'placeholder={t(\'search_users\')}'],
  ['placeholder="Search users by name, username, role, or email..."', 'placeholder={t(\'search_ceo_users\')}'],
  ['placeholder="Search by reference, customer, email, subject, or message..."', 'placeholder={t(\'search_compliance\')}'],
  ['placeholder="Search by ID, client, account, type, or description..."', 'placeholder={t(\'search_transactions\')}'],
  ['No pending CEO loan approvals', "{t('no_pending_ceo_loans')}"],
  ['Pending loans:', "{t('pending_loans_label')}:"],
  ['Pending Loan Exposure', "{t('pending_loan_exposure')}"],
  ['View all', "{t('view_all')}"],
  ['Balance Before', "{t('table_balance_before')}"],
  ['Balance After', "{t('table_balance_after')}"],
  ['>View all<', ">{t('view_all')}<"],
  ['Pending Loan Approvals', "{t('pending_loan_approvals')}"],
  ['Select gender', "{t('select_gender')}"],
  ['Date of Birth', "{t('date_of_birth')}"],
  ['Select ID type', "{t('select_id_type')}"],
  ['Select income source', "{t('select_income_source')}"],
  ['Phone (+251)', "{t('phone_et')}"],
  ['>Address<', ">{t('address')}<"],
  ['Review Notes', "{t('review_notes')}"],
  ['Add Account', "{t('add_account')}"],
  ['Create Client (Registration Procedure)', "{t('modal_create_client')}"],
  ['Update Client', "{t('update_client')}"],
  ['Client Accounts', "{t('client_accounts')}"],
  ['Client ID', "{t('client_id_label')}"],
  ['Account ID', "{t('account_id_label')}"],
  ['Account Type', "{t('account_type')}"],
  ['Create Account', "{t('modal_create_account')}"],
  ['Review client KYC', "{t('review_client_kyc')}"],
  ['Loading KYC details...', "{t('loading_kyc_details')}"],
  ['Loading KYC details…', "{t('loading_kyc_details')}"],
  ['No uploaded documents yet.', "{t('no_uploaded_documents')}"],
  ['Delete Client', "{t('modal_delete_client')}"],
  ['View ID', "{t('view_id')}"],
  ['View Photo', "{t('view_photo')}"],
  ['Review KYC Match', "{t('modal_review_kyc_match')}"],
  ['Quick Links', "{t('landing_quick_links')}"],
  ['>Actions<', ">{t('actions')}<"],
  ['>Status<', ">{t('status')}<"],
  ['>Amount<', ">{t('amount')}<"],
  ['>Date<', ">{t('date')}<"],
  ['>Description<', ">{t('description')}<"],
  ['>Name<', ">{t('name')}<"],
  ['>Email<', ">{t('email')}<"],
  ['>Refresh<', ">{t('refresh')}<"],
  ['>Filter<', ">{t('filter')}<"],
  ['>Download<', ">{t('download')}<"],
  ['>Upload<', ">{t('upload')}<"],
  ['>Edit<', ">{t('edit')}<"],
  ['>Delete<', ">{t('delete')}<"],
  ['>View<', ">{t('view')}<"],
  ['>Submit<', ">{t('submit')}<"],
  ['>Confirm<', ">{t('confirm')}<"],
  ['>Back<', ">{t('back')}<"],
  ['All statuses', "{t('all_statuses')}"],
  ['Clear filters', "{t('clear_filters')}"],
  ['Export CSV', "{t('export_csv')}"],
  ['>Print<', ">{t('print')}<"],
  ['Reject Loan', "{t('reject_loan_modal')}"],
  ['Saving...', "{t('saving_label')}"],
  ['Saving…', "{t('saving_label')}"],
  ['Updating...', "{t('updating_label')}"],
  ['Updating…', "{t('updating_label')}"],
  ['No phone', "{t('no_phone')}"],
  ['No details available', "{t('no_details')}"],
  ['Loading dashboard data...', "{t('loading_dashboard')}"],
  ['Loading dashboard data…', "{t('loading_dashboard')}"],
  ['Refreshing…', "{t('refreshing')}"],
  ['Refreshing...', "{t('refreshing')}"],
];

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith('.jsx')) files.push(p);
  }
  return files;
}

let updated = 0;
for (const file of walk(pagesDir)) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('useLanguage') || !src.includes("const { t")) continue;
  const before = src;
  for (const [from, to] of replacements) {
    src = src.split(from).join(to);
  }
  if (src !== before) {
    fs.writeFileSync(file, src);
    updated++;
    console.log('updated:', path.relative(pagesDir, file));
  }
}
console.log('Total files updated:', updated);
