// Per-role un-actioned request counts for the sidebar badges (Phase 4).
// Each fetcher returns { tabKey: count }. Failures resolve {} so a
// flaky endpoint never breaks the dashboard. Polled every 60s.

import { apiFetch } from "./api";

async function safe(p) {
  try { return await p; } catch { return null; }
}

export async function managerBadges(token) {
  const [tre, loans, payroll, expenses] = await Promise.all([
    safe(apiFetch("/treasury/overview", { token })),
    safe(apiFetch("/loan/applications?status=pending&limit=1", { token })),
    safe(apiFetch("/payroll?status=pending&limit=1", { token })),
    safe(apiFetch("/expenses?status=pending&limit=1", { token })),
  ]);
  return {
    treasury: tre?.pendingForMe || 0,
    "loan-approvals": loans?.total || 0,
    "payroll-approvals": payroll?.total || 0,
    expenses: expenses?.total || 0,
  };
}

export async function bookkeeperBadges(token) {
  const [tre, loans, adj] = await Promise.all([
    safe(apiFetch("/treasury/overview", { token })),
    safe(apiFetch("/loan/applications?status=manager_approved&limit=1", { token })),
    safe(apiFetch("/adjustments?status=pending", { token })),
  ]);
  return {
    treasury: tre?.pendingForMe || 0,
    "loan-approvals": loans?.total || 0,
    adjustments: (adj?.items || []).length,
  };
}

export async function adminBadges(token) {
  const [tre, fb, mon] = await Promise.all([
    safe(apiFetch("/treasury/overview", { token })),
    safe(apiFetch("/public/dev-feedback/admin?status=unread", { token })),
    safe(apiFetch("/admin/errors?status=open", { token })),
  ]);
  return {
    treasury: tre?.pendingForMe || 0,
    "dev-feedback": fb?.unread || 0,
    monitor: mon?.openCount || 0,
  };
}

// Cashier's Disbursements pill aggregates every queue waiting on them.
export async function cashierBadges(token) {
  const [tre, exp, loans, payroll, fees] = await Promise.all([
    safe(apiFetch("/treasury/overview", { token })),
    safe(apiFetch("/expenses?status=approved&limit=1", { token })),
    safe(apiFetch("/cashier/loan-disbursements", { token })),
    safe(apiFetch("/cashier/payroll-disbursements", { token })),
    safe(apiFetch("/cashier/member-fees", { token })),
  ]);
  return {
    treasury: tre?.pendingForMe || 0,
    disbursements:
      (exp?.total || 0) +
      (loans?.items?.length || 0) +
      (payroll?.items?.length || 0) +
      (fees?.items?.length || 0),
  };
}
