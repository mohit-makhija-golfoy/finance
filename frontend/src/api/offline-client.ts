/**
 * Offline-first API Client
 * Uses local SQLite database instead of remote backend
 * Maintains the same interface as the original API client
 * Gracefully handles database initialization issues (especially on web)
 */

import * as db from '@/src/database/db';
import { storage } from '@/src/utils/storage';
import { toLocalYMD } from '@/src/utils/date';
import { computeLoanFields } from '@/src/utils/loanMath';

export const TOKEN_KEY = 'auth_token';
export const CURRENT_USER_KEY = 'current_user';

type StoredUser = {
  id?: string;
  email?: string;
  full_name?: string | null;
};

type BackupFile = {
  version: number;
  exported_at: string;
  sections: db.BackupSection[];
  settings?: {
    theme_mode?: string | null;
    currency_code?: string | null;
    current_user?: StoredUser | null;
  };
  data: db.BackupData;
};

// ============ AUTH API ============

export async function apiRegister(email: string, fullName?: string) {
  // Create user in database
  const userId = await db.createUser(email, fullName);

  // Create token (just the user ID for offline)
  const token = userId;

  // Store token and user info
  await storage.secureSet(TOKEN_KEY, token);
  await storage.secureSet(CURRENT_USER_KEY, JSON.stringify({
    id: userId,
    email,
    full_name: fullName,
  }));

  return {
    user: { id: userId, email, full_name: fullName },
    access_token: token,
    token_type: 'bearer',
  };
}

export async function apiLogin(email: string) {
  const user = await db.getUserByEmail(email);

  if (!user) {
    throw new Error('No account found with this email');
  }

  // Create token
  const token = user.id;

  // Store token and user info
  await storage.secureSet(TOKEN_KEY, token);
  await storage.secureSet(CURRENT_USER_KEY, JSON.stringify({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
  }));

  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    },
    access_token: token,
    token_type: 'bearer',
  };
}

export async function apiGetMe() {
  const token = await storage.secureGet<string>(TOKEN_KEY, '');

  if (!token) {
    throw new Error('Not authenticated');
  }

  const userJson = await storage.secureGet<string>(CURRENT_USER_KEY, '');
  if (!userJson) {
    throw new Error('User not found');
  }

  return JSON.parse(userJson);
}

export async function apiGetDebugUsers() {
  return db.getAllUsersForDebug();
}

export async function apiDeleteAccount() {
  const userId = await getCurrentUserId();
  const user = await db.getUserById(userId);
  if (!user) throw new Error('User not found');

  await db.deleteUserAccount(userId);
  await storage.secureRemove(TOKEN_KEY);
  await storage.secureRemove(CURRENT_USER_KEY);
  return { ok: true };
}

export async function apiExportBackup(sections: db.BackupSection[]): Promise<BackupFile> {
  const uniqueSections = Array.from(new Set(sections));
  const userId = await getCurrentUserId();
  const data = await db.exportBackupData(uniqueSections, userId);
  const backup: BackupFile = {
    version: 1,
    exported_at: new Date().toISOString(),
    sections: uniqueSections,
    data,
  };

  if (uniqueSections.includes('settings')) {
    const themeMode = await storage.getItem<string>('theme_mode', 'dark');
    const currencyCode = await storage.getItem<string>('currency_code', 'USD');
    const currentUserJson = await storage.secureGet<string>(CURRENT_USER_KEY, '');
    let currentUser: StoredUser | null = null;
    if (currentUserJson) {
      try {
        currentUser = JSON.parse(currentUserJson) as StoredUser;
      } catch {
        currentUser = null;
      }
    }

    backup.settings = {
      theme_mode: themeMode,
      currency_code: currencyCode,
      current_user: currentUser,
    };
  }

  return backup;
}

export async function apiImportBackup(file: BackupFile, sections: db.BackupSection[], mode: db.ImportMode = 'add') {
  const uniqueSections = Array.from(new Set(sections));
  const userId = await getCurrentUserId();
  await db.importBackupData(file?.data || {}, uniqueSections, userId, mode);

  if (uniqueSections.includes('settings') && file?.settings?.theme_mode) {
    await storage.setItem('theme_mode', file.settings.theme_mode);
  }
  if (uniqueSections.includes('settings') && file?.settings?.currency_code) {
    await storage.setItem('currency_code', file.settings.currency_code);
  }

  return { ok: true };
}

// ============ MEMBERS API ============

export async function apiGetMembers() {
  const userId = await getCurrentUserId();
  let members = await db.getMembers(userId);
  if (!members.length) {
    const userJson = await storage.secureGet<string>(CURRENT_USER_KEY, '');
    let fallbackName = 'Self';
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson) as StoredUser;
        fallbackName = parsed.full_name?.trim() || 'Self';
      } catch {
        // Use default fallback name.
      }
    }
    await db.createMember(userId, fallbackName, 'Self', '#10B981');
    members = await db.getMembers(userId);
  }
  return members;
}

export async function apiCreateMember(name: string, relation?: string, color?: string) {
  const userId = await getCurrentUserId();
  const memberId = await db.createMember(userId, name, relation, color);
  return {
    id: memberId,
    user_id: userId,
    name,
    relation: relation || null,
    color: color || '#FAFAFA',
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateMember(memberId: string, name: string, relation?: string, color?: string) {
  const userId = await getCurrentUserId();
  await db.updateMember(memberId, userId, name, relation, color);
  return { ok: true };
}

export async function apiDeleteMember(memberId: string) {
  const userId = await getCurrentUserId();
  await db.deleteMember(memberId, userId);
  return { ok: true };
}

// ============ CATEGORIES API ============

export async function apiGetCategories() {
  const userId = await getCurrentUserId();
  let categories = await db.getCategories(userId);
  if (!categories.length) {
    const defaults: Array<{ name: string; type: 'income' | 'expense' }> = [
      { name: 'Salary', type: 'income' },
      { name: 'Bonus', type: 'income' },
      { name: 'Food', type: 'expense' },
      { name: 'Transport', type: 'expense' },
      { name: 'Entertainment', type: 'expense' },
      { name: 'Utilities', type: 'expense' },
      { name: 'Healthcare', type: 'expense' },
    ];
    for (const item of defaults) {
      await db.createCategory(userId, item.name, item.type);
    }
    categories = await db.getCategories(userId);
  }
  return categories;
}

export async function apiCreateCategory(name: string, type: 'income' | 'expense', icon?: string | null) {
  const userId = await getCurrentUserId();
  const categoryId = await db.createCategory(userId, name, type, icon);
  return {
    id: categoryId,
    user_id: userId,
    name,
    type,
    icon: icon || null,
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateCategory(categoryId: string, name: string, type: 'income' | 'expense', icon?: string | null) {
  const userId = await getCurrentUserId();
  await db.updateCategory(categoryId, userId, name, type, icon);
  return { ok: true };
}

export async function apiDeleteCategory(categoryId: string) {
  const userId = await getCurrentUserId();
  await db.deleteCategory(categoryId, userId);
  return { ok: true };
}

// ============ TAGS API ============

export async function apiGetTags() {
  const userId = await getCurrentUserId();
  return db.getTags(userId);
}

export async function apiCreateTag(name: string) {
  const userId = await getCurrentUserId();
  const tagId = await db.createTag(userId, name);
  return {
    id: tagId,
    user_id: userId,
    name,
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateTag(tagId: string, name: string) {
  const userId = await getCurrentUserId();
  await db.updateTag(tagId, userId, name);
  return { ok: true };
}

export async function apiDeleteTag(tagId: string) {
  const userId = await getCurrentUserId();
  await db.deleteTag(tagId, userId);
  return { ok: true };
}

// ============ CATEGORY RULES API ============

export async function apiGetCategoryRules() {
  const userId = await getCurrentUserId();
  return db.getCategoryRules(userId);
}

export async function apiUpsertCategoryRule(keyword: string, category: string, category_type: 'income' | 'expense', tag_ids: string[]) {
  const userId = await getCurrentUserId();
  const ruleId = await db.upsertCategoryRule(userId, keyword, category, category_type, tag_ids || []);
  return {
    id: ruleId,
    user_id: userId,
    keyword,
    category,
    category_type,
    tag_ids: tag_ids || [],
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateCategoryRule(ruleId: string, keyword: string, category: string, category_type: 'income' | 'expense', tag_ids: string[]) {
  const userId = await getCurrentUserId();
  await db.updateCategoryRule(ruleId, userId, keyword, category, category_type, tag_ids || []);
  return { ok: true };
}

export async function apiDeleteCategoryRule(ruleId: string) {
  const userId = await getCurrentUserId();
  await db.deleteCategoryRule(ruleId, userId);
  return { ok: true };
}

export async function apiApplyCategoryRuleToExisting(keyword: string, category: string, category_type: 'income' | 'expense', tag_ids: string[]) {
  const userId = await getCurrentUserId();
  const updated = await db.applyCategoryRuleToExisting(userId, keyword, category, category_type, tag_ids || []);
  return { ok: true, updated };
}

// ============ TRANSACTIONS API ============

export async function apiGetTransactions(params: {
  member_ids?: string;
  type?: 'income' | 'expense';
  category?: string;
  categories?: string;
  start_date?: string;
  end_date?: string;
  tag_ids?: string;
}) {
  const userId = await getCurrentUserId();

  return db.getTransactions(userId, {
    memberIds: params.member_ids ? params.member_ids.split(',') : undefined,
    type: params.type,
    category: params.category,
    categories: params.categories ? params.categories.split(',') : undefined,
    startDate: params.start_date,
    endDate: params.end_date,
    tagIds: params.tag_ids ? params.tag_ids.split(',') : undefined,
  });
}

export async function apiCreateTransaction(
  type: 'income' | 'expense',
  amount: number,
  category: string,
  date: string,
  notes: string | null,
  member_id: string,
  tag_ids?: string[]
) {
  const userId = await getCurrentUserId();
  const txId = await db.createTransaction(userId, type, amount, category, date, member_id, notes || undefined, tag_ids || []);
  return {
    id: txId,
    user_id: userId,
    type,
    amount,
    category,
    date,
    notes,
    member_id,
    tag_ids: tag_ids || [],
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateTransaction(
  txId: string,
  type: 'income' | 'expense',
  amount: number,
  category: string,
  date: string,
  notes: string | null,
  member_id: string,
  tag_ids?: string[]
) {
  const userId = await getCurrentUserId();
  await db.updateTransaction(txId, userId, type, amount, category, date, member_id, notes || undefined, tag_ids || []);
  return { ok: true };
}

export async function apiDeleteTransaction(txId: string) {
  const userId = await getCurrentUserId();
  await db.deleteTransaction(txId, userId);
  return { ok: true };
}

// ============ INVESTMENTS API ============

export async function apiGetInvestments(params?: { member_ids?: string }) {
  const userId = await getCurrentUserId();
  const memberIds = params?.member_ids ? params.member_ids.split(',') : undefined;
  return db.getInvestments(userId, memberIds);
}

export async function apiGetInvestmentDetail(invId: string) {
  const userId = await getCurrentUserId();
  return db.getInvestmentById(invId, userId);
}

export async function apiCreateInvestment(body: any) {
  const userId = await getCurrentUserId();
  const invId = await db.createInvestment(
    userId,
    body.member_id,
    body.name,
    body.type,
    body.amount,
    body.start_date,
    body.current_value,
    body.maturity_date,
    undefined,
    body.expected_return,
    body.expected_return_type,
    body.notes
  );

  return {
    id: invId,
    user_id: userId,
    ...body,
    status: 'active',
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateInvestment(invId: string, body: any) {
  const userId = await getCurrentUserId();
  const updates: any = {};

  if ('name' in body) updates.name = body.name;
  if ('type' in body) updates.type = body.type;
  if ('amount' in body) updates.amount = body.amount;
  if ('current_value' in body) updates.current_value = body.current_value;
  if ('start_date' in body) updates.start_date = body.start_date;
  if ('maturity_date' in body) updates.maturity_date = body.maturity_date;
  if ('expected_return' in body) updates.expected_return = body.expected_return;
  if ('expected_return_type' in body) updates.expected_return_type = body.expected_return_type;

  await db.updateInvestment(invId, userId, updates);
  return { ok: true };
}

export async function apiDeleteInvestment(invId: string) {
  const userId = await getCurrentUserId();
  await db.deleteInvestment(invId, userId);
  return { ok: true };
}

export async function apiAddInvestmentValue(invId: string, body: { date: string; current_value: number }) {
  await db.addInvestmentValue(invId, body.date, body.current_value);
  return { ok: true };
}

export async function apiWithdrawInvestment(invId: string, body: any) {
  const userId = await getCurrentUserId();
  await db.addInvestmentWithdrawal(
    invId,
    userId,
    body.amount,
    body.date,
    body.notes,
    body.add_to_income
  );
  return { ok: true };
}

export async function apiCloseInvestment(invId: string) {
  const userId = await getCurrentUserId();
  await db.updateInvestment(invId, userId, {
    status: 'closed',
    end_date: toLocalYMD(new Date()),
  });
  return { ok: true };
}

export async function apiMatureInvestment(invId: string, body: { amount: number; date?: string }) {
  const userId = await getCurrentUserId();
  const date = body.date || toLocalYMD(new Date());
  const result = await db.matureInvestment(invId, userId, body.amount, date);
  if (!result) throw new Error('Investment not found');
  return { ok: true, tx_id: result.tx_id };
}

// ============ LOANS API ============

export async function apiGetLoans(params?: { member_ids?: string }) {
  const userId = await getCurrentUserId();
  const memberIds = params?.member_ids ? params.member_ids.split(',') : undefined;
  return db.getLoans(userId, memberIds);
}

export async function apiGetLoanDetail(loanId: string) {
  const userId = await getCurrentUserId();
  return db.getLoanById(loanId, userId);
}

export async function apiCreateLoan(body: any) {
  const userId = await getCurrentUserId();
  const loanId = await db.createLoan(
    userId,
    body.member_id,
    body.name,
    body.total_amount,
    body.interest_rate,
    body.emi,
    body.tenure_months,
    body.start_date,
    body.notes
  );

  return {
    id: loanId,
    user_id: userId,
    ...body,
    status: 'active',
    created_at: new Date().toISOString(),
  };
}

export async function apiUpdateLoan(loanId: string, body: any) {
  const userId = await getCurrentUserId();
  const updates: any = {};

  if ('name' in body) updates.name = body.name;
  if ('total_amount' in body) updates.total_amount = body.total_amount;
  if ('interest_rate' in body) updates.interest_rate = body.interest_rate;
  if ('emi' in body) updates.emi = body.emi;
  if ('tenure_months' in body) updates.tenure_months = body.tenure_months;
  if ('start_date' in body) updates.start_date = body.start_date;
  if ('notes' in body) updates.notes = body.notes;

  await db.updateLoan(loanId, userId, updates);
  return { ok: true };
}

export async function apiDeleteLoan(loanId: string) {
  const userId = await getCurrentUserId();
  await db.deleteLoan(loanId, userId);
  return { ok: true };
}

export async function apiAddLoanPayment(loanId: string, body: any) {
  await db.addLoanPayment(loanId, body.amount, body.date, body.type, body.notes);
  return { ok: true };
}

export async function apiCloseLoan(loanId: string) {
  const userId = await getCurrentUserId();
  await db.updateLoan(loanId, userId, { status: 'closed' });
  return { ok: true };
}

// ============ DASHBOARD API ============

export async function apiGetDashboard(params: {
  member_ids?: string;
  start_date?: string;
  end_date?: string;
}) {
  const userId = await getCurrentUserId();
  const memberIds = params.member_ids ? params.member_ids.split(',') : undefined;

  return db.getDashboardStats(userId, memberIds, params.start_date, params.end_date);
}

// ============ REMINDERS API ============

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(monthKey?: string) {
  const now = new Date();
  const [yearRaw, monthRaw] = (monthKey || getMonthKey(now)).split('-');
  const year = Number(yearRaw) || now.getFullYear();
  const month = Number(monthRaw) || now.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { key: `${year}-${String(month).padStart(2, '0')}`, start, end };
}

function monthIndexFromKey(key: string): number {
  const [y, m] = key.split('-').map((v) => Number(v));
  if (!y || !m) return 0;
  return y * 12 + (m - 1);
}

function loanMonthBounds(loan: any): { startKey: string; endKey: string } | null {
  if (!loan?.start_date || !loan?.tenure_months) return null;
  const start = new Date(String(loan.start_date).slice(0, 10));
  if (Number.isNaN(start.getTime())) return null;

  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endDate = new Date(start.getFullYear(), start.getMonth() + Number(loan.tenure_months) - 1, 1);
  const endKey = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
  return { startKey, endKey };
}

function recurringInvestmentMonthBounds(inv: any): { startKey: string; endKey?: string } | null {
  if (!inv?.start_date) return null;
  const start = new Date(String(inv.start_date).slice(0, 10));
  if (Number.isNaN(start.getTime())) return null;

  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  if ((inv.status || 'active') !== 'closed' || !inv.end_date) return { startKey };

  const end = new Date(String(inv.end_date).slice(0, 10));
  if (Number.isNaN(end.getTime())) return { startKey };
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  return { startKey, endKey };
}

export async function apiGetReminders() {
  const userId = await getCurrentUserId();
  const members = await db.getMembers(userId);
  const memberNameById = new Map(members.map((m) => [m.id, m.name]));
  const loans = await db.getLoans(userId);
  const investments = await db.getInvestments(userId);
  const { key: month, start, end } = monthRange();

  const expenseTxs = await db.getTransactions(userId, {
    type: 'expense',
    startDate: start,
    endDate: end,
  });

  const reminders: any[] = [];

  for (const loan of loans as any[]) {
    if ((loan.status || 'active') === 'closed') continue;
    const emiAmount = Number(loan.emi) || 0;
    if (emiAmount <= 0) continue;
    const bounds = loanMonthBounds(loan);
    if (!bounds) continue;

    const currentIdx = monthIndexFromKey(month);
    const startIdx = monthIndexFromKey(bounds.startKey);
    const endIdx = monthIndexFromKey(bounds.endKey);
    if (currentIdx < startIdx || currentIdx > endIdx) continue;

    const paidByLoanPayment = Array.isArray(loan.payments)
      ? loan.payments.some((p: any) => String(p.date || '').slice(0, 7) === month && (p.type || 'emi') === 'emi')
      : false;
    const paidByExpenseTx = expenseTxs.some(
      (t: any) =>
        t.category === 'EMI' &&
        t.member_id === loan.member_id &&
        String(t.notes || '').includes(`[AUTO_EMI:${loan.id}:${month}]`)
    );

    if (!paidByLoanPayment && !paidByExpenseTx) {
      reminders.push({
        kind: 'loan',
        id: loan.id,
        month,
        name: loan.name,
        member_name: memberNameById.get(loan.member_id) || 'Self',
        amount: emiAmount,
      });
    }
  }

  for (const inv of investments as any[]) {
    if ((inv.status || 'active') === 'closed') continue;
    if (inv.type !== 'recurring') continue;
    const bounds = recurringInvestmentMonthBounds(inv);
    if (!bounds) continue;

    const currentIdx = monthIndexFromKey(month);
    const startIdx = monthIndexFromKey(bounds.startKey);
    const endIdx = bounds.endKey ? monthIndexFromKey(bounds.endKey) : Number.POSITIVE_INFINITY;
    if (currentIdx < startIdx || currentIdx > endIdx) continue;

    const sipAmount = Number(inv.amount) || 0;
    if (sipAmount <= 0) continue;

    const paidByExpenseTx = expenseTxs.some(
      (t: any) =>
        t.category === 'SIP' &&
        t.member_id === inv.member_id &&
        String(t.notes || '').includes(`[AUTO_SIP:${inv.id}:${month}]`)
    );

    if (!paidByExpenseTx) {
      reminders.push({
        kind: 'investment',
        id: inv.id,
        month,
        name: inv.name,
        member_name: memberNameById.get(inv.member_id) || 'Self',
        amount: sipAmount,
      });
    }
  }

  reminders.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === 'loan' ? -1 : 1;
  });

  return reminders;
}

export async function apiPayReminder(body: { kind: string; id: string; month?: string }) {
  const userId = await getCurrentUserId();
  const { key: month } = monthRange(body?.month);
  const today = toLocalYMD(new Date());

  if (body.kind === 'loan') {
    const loan = await db.getLoanById(body.id, userId) as any;
    if (!loan || (loan.status || 'active') === 'closed') return { ok: false, message: 'Loan not found' };
    const emiAmount = Number(loan.emi) || 0;
    if (emiAmount <= 0) return { ok: false, message: 'Invalid EMI amount' };
    const bounds = loanMonthBounds(loan);
    if (!bounds) return { ok: false, message: 'Invalid loan schedule' };
    const targetIdx = monthIndexFromKey(month);
    if (targetIdx < monthIndexFromKey(bounds.startKey) || targetIdx > monthIndexFromKey(bounds.endKey)) {
      return { ok: false, message: 'Installment month is outside loan schedule' };
    }

    const alreadyPaid = Array.isArray(loan.payments)
      ? loan.payments.some((p: any) => String(p.date || '').slice(0, 7) === month && (p.type || 'emi') === 'emi')
      : false;
    if (alreadyPaid) return { ok: true, skipped: true };

    await db.addLoanPayment(loan.id, emiAmount, today, 'emi', `Auto EMI for ${loan.name} (${month})`);
    await db.createTransaction(
      userId,
      'expense',
      emiAmount,
      'EMI',
      today,
      loan.member_id,
      `Auto EMI for ${loan.name} (${month}) [AUTO_EMI:${loan.id}:${month}]`
    );

    return { ok: true };
  }

  if (body.kind === 'investment') {
    const inv = await db.getInvestmentById(body.id, userId) as any;
    if (!inv || (inv.status || 'active') === 'closed') return { ok: false, message: 'Investment not found' };
    if (inv.type !== 'recurring') return { ok: false, message: 'Reminder is only for recurring investments' };

    const bounds = recurringInvestmentMonthBounds(inv);
    if (!bounds) return { ok: false, message: 'Invalid investment schedule' };
    const targetIdx = monthIndexFromKey(month);
    const startIdx = monthIndexFromKey(bounds.startKey);
    const endIdx = bounds.endKey ? monthIndexFromKey(bounds.endKey) : Number.POSITIVE_INFINITY;
    if (targetIdx < startIdx || targetIdx > endIdx) {
      return { ok: false, message: 'Installment month is outside investment schedule' };
    }

    const sipAmount = Number(inv.amount) || 0;
    if (sipAmount <= 0) return { ok: false, message: 'Invalid SIP amount' };

    const { start, end } = monthRange(month);
    const monthExpenseTxs = await db.getTransactions(userId, {
      type: 'expense',
      startDate: start,
      endDate: end,
    });
    const alreadyPaid = monthExpenseTxs.some(
      (t: any) =>
        t.category === 'SIP' &&
        t.member_id === inv.member_id &&
        String(t.notes || '').includes(`[AUTO_SIP:${inv.id}:${month}]`)
    );
    if (alreadyPaid) return { ok: true, skipped: true };

    await db.createTransaction(
      userId,
      'expense',
      sipAmount,
      'SIP',
      today,
      inv.member_id,
      `Auto SIP for ${inv.name} (${month}) [AUTO_SIP:${inv.id}:${month}]`
    );

    const currentValue = Number(inv.current_value ?? inv.total_invested ?? 0) || 0;
    await db.addInvestmentValue(inv.id, today, currentValue + sipAmount);

    return { ok: true };
  }

  return { ok: false, message: 'Unknown reminder kind' };
}

// ============ HELPERS ============

async function getCurrentUserId(): Promise<string> {
  const token = await storage.secureGet<string>(TOKEN_KEY, '');
  const userJson = await storage.secureGet<string>(CURRENT_USER_KEY, '');

  if (userJson) {
    try {
      const parsed = JSON.parse(userJson) as StoredUser;
      if (parsed?.id) {
        // Repair legacy sessions where token was a JWT instead of local user ID.
        if (token !== parsed.id) {
          await storage.secureSet(TOKEN_KEY, parsed.id);
        }
        return parsed.id;
      }
    } catch {
      // Ignore malformed user JSON and fallback to token.
    }
  }

  if (!token) {
    throw new Error('Not authenticated');
  }

  return token; // In offline mode, token is the user ID
}

/**
 * Create a wrapper that matches the original API interface
 * This is used by the AuthContext and screens
 */
export const api = {
  get: async (path: string) => {
    // Parse the path to determine what to fetch
    if (path === '/members') return apiGetMembers();
    if (path === '/categories') return apiGetCategories();
    if (path === '/tags') return apiGetTags();
    if (path === '/category-rules') return apiGetCategoryRules();
    if (path === '/auth/me') return apiGetMe();
    if (path === '/debug/users') return apiGetDebugUsers();
    if (path.startsWith('/transactions')) {
      const url = new URL(`http://localhost${path}`);
      return apiGetTransactions({
        member_ids: url.searchParams.get('member_ids') || undefined,
        type: (url.searchParams.get('type') as any) || undefined,
        category: url.searchParams.get('category') || undefined,
        categories: url.searchParams.get('categories') || undefined,
        start_date: url.searchParams.get('start_date') || undefined,
        end_date: url.searchParams.get('end_date') || undefined,
        tag_ids: url.searchParams.get('tag_ids') || undefined,
      });
    }
    if (path.startsWith('/investments')) {
      if (path === '/investments' || path.startsWith('/investments?')) {
        const url = new URL(`http://localhost${path}`);
        return apiGetInvestments({
          member_ids: url.searchParams.get('member_ids') || undefined,
        });
      }
      const invId = path.split('/')[2];
      return apiGetInvestmentDetail(invId);
    }
    if (path.startsWith('/loans')) {
      if (path === '/loans' || path.startsWith('/loans?')) {
        const url = new URL(`http://localhost${path}`);
        return apiGetLoans({
          member_ids: url.searchParams.get('member_ids') || undefined,
        });
      }
      const loanId = path.split('/')[2];
      return apiGetLoanDetail(loanId);
    }
    if (path.startsWith('/dashboard')) {
      const url = new URL(`http://localhost${path}`);
      return apiGetDashboard({
        member_ids: url.searchParams.get('member_ids') || undefined,
        start_date: url.searchParams.get('start_date') || undefined,
        end_date: url.searchParams.get('end_date') || undefined,
      });
    }
    if (path === '/reminders') {
      return apiGetReminders();
    }
    throw new Error(`Unknown GET path: ${path}`);
  },

  post: async (path: string, body?: any) => {
    if (path === '/auth/login') return apiLogin(body.email);
    if (path === '/auth/register') return apiRegister(body.email, body.full_name);
    if (path === '/members') return apiCreateMember(body.name, body.relation, body.color);
    if (path === '/categories') return apiCreateCategory(body.name, body.type, body.icon);
    if (path === '/tags') return apiCreateTag(body.name);
    if (path === '/category-rules') return apiUpsertCategoryRule(body.keyword, body.category, body.category_type, body.tag_ids);
    if (path === '/category-rules/apply') return apiApplyCategoryRuleToExisting(body.keyword, body.category, body.category_type, body.tag_ids);
    if (path === '/transactions') return apiCreateTransaction(body.type, body.amount, body.category, body.date, body.notes, body.member_id, body.tag_ids);
    if (path === '/investments') return apiCreateInvestment(body);
    if (path.startsWith('/investments/') && path.endsWith('/value')) {
      const invId = path.split('/')[2];
      return apiAddInvestmentValue(invId, body);
    }
    if (path.startsWith('/investments/') && path.endsWith('/withdraw')) {
      const invId = path.split('/')[2];
      return apiWithdrawInvestment(invId, body);
    }
    if (path.startsWith('/investments/') && path.endsWith('/close')) {
      const invId = path.split('/')[2];
      return apiCloseInvestment(invId);
    }
    if (path.startsWith('/investments/') && path.endsWith('/mature')) {
      const invId = path.split('/')[2];
      return apiMatureInvestment(invId, body);
    }
    if (path === '/loans') return apiCreateLoan(body);
    if (path.startsWith('/loans/') && path.endsWith('/payment')) {
      const loanId = path.split('/')[2];
      return apiAddLoanPayment(loanId, body);
    }
    if (path.startsWith('/loans/') && path.endsWith('/close')) {
      const loanId = path.split('/')[2];
      return apiCloseLoan(loanId);
    }
    if (path === '/loans/compute') {
      return computeLoanFields(body || {});
    }
    if (path.startsWith('/reminders/pay')) {
      return apiPayReminder(body || {});
    }
    throw new Error(`Unknown POST path: ${path}`);
  },

  put: async (path: string, body?: any) => {
    if (path.startsWith('/transactions/')) {
      const txId = path.split('/')[2];
      return apiUpdateTransaction(txId, body.type, body.amount, body.category, body.date, body.notes, body.member_id, body.tag_ids);
    }
    if (path.startsWith('/investments/')) {
      const invId = path.split('/')[2];
      return apiUpdateInvestment(invId, body);
    }
    if (path.startsWith('/loans/')) {
      const loanId = path.split('/')[2];
      return apiUpdateLoan(loanId, body);
    }
    if (path.startsWith('/members/')) {
      const memberId = path.split('/')[2];
      return apiUpdateMember(memberId, body.name, body.relation, body.color);
    }
    if (path.startsWith('/categories/')) {
      const categoryId = path.split('/')[2];
      return apiUpdateCategory(categoryId, body.name, body.type, body.icon);
    }
    if (path.startsWith('/tags/')) {
      const tagId = path.split('/')[2];
      return apiUpdateTag(tagId, body.name);
    }
    if (path.startsWith('/category-rules/')) {
      const ruleId = path.split('/')[2];
      return apiUpdateCategoryRule(ruleId, body.keyword, body.category, body.category_type, body.tag_ids);
    }
    throw new Error(`Unknown PUT path: ${path}`);
  },

  del: async (path: string) => {
    if (path.startsWith('/transactions/')) {
      const txId = path.split('/')[2];
      return apiDeleteTransaction(txId);
    }
    if (path.startsWith('/investments/')) {
      const invId = path.split('/')[2];
      return apiDeleteInvestment(invId);
    }
    if (path.startsWith('/loans/')) {
      const loanId = path.split('/')[2];
      return apiDeleteLoan(loanId);
    }
    if (path.startsWith('/members/')) {
      const memberId = path.split('/')[2];
      return apiDeleteMember(memberId);
    }
    if (path.startsWith('/categories/')) {
      const categoryId = path.split('/')[2];
      return apiDeleteCategory(categoryId);
    }
    if (path.startsWith('/tags/')) {
      const tagId = path.split('/')[2];
      return apiDeleteTag(tagId);
    }
    if (path.startsWith('/category-rules/')) {
      const ruleId = path.split('/')[2];
      return apiDeleteCategoryRule(ruleId);
    }
    throw new Error(`Unknown DELETE path: ${path}`);
  },

  getCsv: async (path: string) => {
    // CSV export for reports - implement as needed
    return '';
  },

  exportBackup: async (sections: db.BackupSection[]) => {
    return apiExportBackup(sections);
  },

  importBackup: async (file: BackupFile, sections: db.BackupSection[], mode?: db.ImportMode) => {
    return apiImportBackup(file, sections, mode);
  },

  deleteAccount: async () => {
    return apiDeleteAccount();
  },
};
