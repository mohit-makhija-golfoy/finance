import AsyncStorage from "@react-native-async-storage/async-storage";
import { notesMatchKeyword } from "@/src/utils/categoryRules";

type TxType = "income" | "expense";
type InvestType = "onetime" | "recurring" | "dynamic";
type LoanPayType = "emi" | "prepayment";

type User = {
  id: string;
  email: string;
  full_name?: string | null;
  hashed_password: string;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  name: string;
  relation?: string | null;
  color?: string | null;
  created_at: string;
};

type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TxType;
  created_at: string;
};

type Tag = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type CategoryRule = {
  id: string;
  user_id: string;
  keyword: string;
  category: string;
  category_type: TxType;
  tag_ids: string[];
  created_at: string;
};

type Transaction = {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  category: string;
  date: string;
  notes?: string | null;
  member_id: string;
  tag_ids: string[];
  created_at: string;
};

type Investment = {
  id: string;
  user_id: string;
  member_id: string;
  name: string;
  type: InvestType;
  amount: number;
  current_value?: number | null;
  start_date: string;
  maturity_date?: string | null;
  end_date?: string | null;
  expected_return?: number | null;
  expected_return_type?: "percent" | "amount" | null;
  status: "active" | "closed";
  notes?: string | null;
  created_at: string;
};

type InvestmentValueHistory = {
  id: string;
  investment_id: string;
  date: string;
  current_value: number;
  created_at: string;
};

type InvestmentWithdrawal = {
  id: string;
  investment_id: string;
  amount: number;
  date: string;
  notes?: string | null;
  income_tx_id?: string | null;
  created_at: string;
};

type Loan = {
  id: string;
  user_id: string;
  member_id: string;
  name: string;
  total_amount: number;
  interest_rate: number;
  emi: number;
  tenure_months: number;
  start_date: string;
  status: "active" | "closed";
  notes?: string | null;
  created_at: string;
};

type LoanPayment = {
  id: string;
  loan_id: string;
  amount: number;
  date: string;
  type: LoanPayType;
  notes?: string | null;
  created_at: string;
};

type DbState = {
  users: User[];
  members: Member[];
  categories: Category[];
  tags: Tag[];
  category_rules: CategoryRule[];
  transactions: Transaction[];
  investments: Investment[];
  investment_value_history: InvestmentValueHistory[];
  investment_withdrawals: InvestmentWithdrawal[];
  loans: Loan[];
  loan_payments: LoanPayment[];
};

export type BackupSection = "users" | "members" | "categories" | "tags" | "category_rules" | "transactions" | "investments" | "loans" | "settings";

export type BackupData = {
  users?: User[];
  members?: Member[];
  categories?: Category[];
  tags?: Tag[];
  category_rules?: CategoryRule[];
  transactions?: Transaction[];
  investments?: {
    items: Investment[];
    value_history: InvestmentValueHistory[];
    withdrawals: InvestmentWithdrawal[];
  };
  loans?: {
    items: Loan[];
    payments: LoanPayment[];
  };
};

export type ImportMode = "add" | "replace";

const DB_KEY = "offline_family_finance_v1";

const EMPTY_DB: DbState = {
  users: [],
  members: [],
  categories: [],
  tags: [],
  category_rules: [],
  transactions: [],
  investments: [],
  investment_value_history: [],
  investment_withdrawals: [],
  loans: [],
  loan_payments: [],
};

let cache: DbState | null = null;

function nowIso() {
  return new Date().toISOString();
}

function ymdNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function loadDb(): Promise<DbState> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(DB_KEY);
    if (!raw) {
      cache = { ...EMPTY_DB };
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<DbState>;
    cache = {
      users: parsed.users || [],
      members: parsed.members || [],
      categories: parsed.categories || [],
      tags: parsed.tags || [],
      category_rules: parsed.category_rules || [],
      // Default tag_ids for transactions stored before the tags feature existed.
      transactions: (parsed.transactions || []).map((t) => ({ ...t, tag_ids: Array.isArray(t.tag_ids) ? t.tag_ids : [] })),
      investments: parsed.investments || [],
      investment_value_history: parsed.investment_value_history || [],
      investment_withdrawals: parsed.investment_withdrawals || [],
      loans: parsed.loans || [],
      loan_payments: parsed.loan_payments || [],
    };
    return cache;
  } catch {
    cache = { ...EMPTY_DB };
    return cache;
  }
}

async function saveDb(state: DbState) {
  cache = state;
  await AsyncStorage.setItem(DB_KEY, JSON.stringify(state));
}

async function mutateDb(mutator: (state: DbState) => void | Promise<void>) {
  const state = await loadDb();
  await mutator(state);
  await saveDb(state);
}

export async function initializeDatabase() {
  await loadDb();
}

export async function createUser(email: string, hashedPassword: string, fullName?: string) {
  const state = await loadDb();
  const existing = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error("Email already registered");

  const userId = generateId();
  const user: User = {
    id: userId,
    email: email.toLowerCase(),
    full_name: fullName || null,
    hashed_password: hashedPassword,
    created_at: nowIso(),
  };

  await mutateDb(async (s) => {
    s.users.push(user);
  });

  await createMember(userId, fullName || "Self", "Self", "#10B981");

  const defaults: Array<{ name: string; type: TxType }> = [
    { name: "Salary", type: "income" },
    { name: "Bonus", type: "income" },
    { name: "Food", type: "expense" },
    { name: "Transport", type: "expense" },
    { name: "Entertainment", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Healthcare", type: "expense" },
  ];
  for (const c of defaults) {
    try {
      await createCategory(userId, c.name, c.type);
    } catch {
      // Ignore duplicate defaults.
    }
  }

  return userId;
}

export async function getUserByEmail(email: string) {
  const state = await loadDb();
  return state.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function getUserById(userId: string) {
  const state = await loadDb();
  return state.users.find((u) => u.id === userId) || null;
}

export async function getAllUsersForDebug() {
  const state = await loadDb();
  return state.users
    .map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name || null,
      password_hash: u.hashed_password,
      created_at: u.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function updateUserPassword(userId: string, hashedPassword: string) {
  await mutateDb(async (s) => {
    const user = s.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    user.hashed_password = hashedPassword;
  });
}

export async function deleteUserAccount(userId: string) {
  await mutateDb(async (s) => {
    const investmentIds = new Set(s.investments.filter((item) => item.user_id === userId).map((item) => item.id));
    const loanIds = new Set(s.loans.filter((item) => item.user_id === userId).map((item) => item.id));

    s.users = s.users.filter((user) => user.id !== userId);
    s.members = s.members.filter((member) => member.user_id !== userId);
    s.categories = s.categories.filter((category) => category.user_id !== userId);
    s.tags = s.tags.filter((tag) => tag.user_id !== userId);
    s.category_rules = s.category_rules.filter((rule) => rule.user_id !== userId);
    s.transactions = s.transactions.filter((tx) => tx.user_id !== userId);
    s.investments = s.investments.filter((item) => item.user_id !== userId);
    s.investment_value_history = s.investment_value_history.filter((item) => !investmentIds.has(item.investment_id));
    s.investment_withdrawals = s.investment_withdrawals.filter((item) => !investmentIds.has(item.investment_id));
    s.loans = s.loans.filter((item) => item.user_id !== userId);
    s.loan_payments = s.loan_payments.filter((item) => !loanIds.has(item.loan_id));
  });
}

export async function exportBackupData(sections: BackupSection[], userId: string): Promise<BackupData> {
  const state = await loadDb();
  const include = new Set(sections);
  const data: BackupData = {};

  if (include.has("users")) data.users = cloneValue(state.users.filter((user) => user.id === userId));
  if (include.has("members")) data.members = cloneValue(state.members.filter((member) => member.user_id === userId));
  if (include.has("categories")) data.categories = cloneValue(state.categories.filter((category) => category.user_id === userId));
  if (include.has("tags")) data.tags = cloneValue(state.tags.filter((tag) => tag.user_id === userId));
  if (include.has("category_rules")) data.category_rules = cloneValue(state.category_rules.filter((rule) => rule.user_id === userId));
  if (include.has("transactions")) data.transactions = cloneValue(state.transactions.filter((tx) => tx.user_id === userId));
  if (include.has("investments")) {
    const investments = state.investments.filter((item) => item.user_id === userId);
    const investmentIds = new Set(investments.map((item) => item.id));
    data.investments = {
      items: cloneValue(investments),
      value_history: cloneValue(state.investment_value_history.filter((item) => investmentIds.has(item.investment_id))),
      withdrawals: cloneValue(state.investment_withdrawals.filter((item) => investmentIds.has(item.investment_id))),
    };
  }
  if (include.has("loans")) {
    const loans = state.loans.filter((item) => item.user_id === userId);
    const loanIds = new Set(loans.map((item) => item.id));
    data.loans = {
      items: cloneValue(loans),
      payments: cloneValue(state.loan_payments.filter((item) => loanIds.has(item.loan_id))),
    };
  }

  return data;
}

export async function importBackupData(data: BackupData, sections: BackupSection[], targetUserId: string, mode: ImportMode) {
  const include = new Set(sections);
  const shouldReplace = mode === "replace";

  await mutateDb(async (s) => {
    const sourceMembers = Array.isArray(data.members) ? cloneValue(data.members) : [];
    const sourceCategories = Array.isArray(data.categories) ? cloneValue(data.categories) : [];
    const sourceTags = Array.isArray(data.tags) ? cloneValue(data.tags) : [];
    const sourceCategoryRules = Array.isArray(data.category_rules) ? cloneValue(data.category_rules) : [];
    const sourceTransactions = Array.isArray(data.transactions) ? cloneValue(data.transactions) : [];
    const sourceInvestments = Array.isArray(data.investments?.items) ? cloneValue(data.investments.items) : [];
    const sourceInvestmentHistory = Array.isArray(data.investments?.value_history) ? cloneValue(data.investments.value_history) : [];
    const sourceInvestmentWithdrawals = Array.isArray(data.investments?.withdrawals) ? cloneValue(data.investments.withdrawals) : [];
    const sourceLoans = Array.isArray(data.loans?.items) ? cloneValue(data.loans.items) : [];
    const sourceLoanPayments = Array.isArray(data.loans?.payments) ? cloneValue(data.loans.payments) : [];

    if (include.has("users") && Array.isArray(data.users)) {
      for (const importedUser of data.users) {
        const exists = s.users.some((user) => user.email.toLowerCase() === importedUser.email.toLowerCase());
        if (exists) continue;
        s.users.push({
          ...cloneValue(importedUser),
          id: generateId(),
        });
      }
    }

    if (shouldReplace && include.has("members")) {
      s.members = s.members.filter((member) => member.user_id !== targetUserId);
    }
    if (shouldReplace && include.has("categories")) {
      s.categories = s.categories.filter((category) => category.user_id !== targetUserId);
    }
    if (shouldReplace && include.has("tags")) {
      s.tags = s.tags.filter((tag) => tag.user_id !== targetUserId);
    }
    if (shouldReplace && include.has("category_rules")) {
      s.category_rules = s.category_rules.filter((rule) => rule.user_id !== targetUserId);
    }
    if (shouldReplace && include.has("transactions")) {
      s.transactions = s.transactions.filter((tx) => tx.user_id !== targetUserId);
    }
    if (shouldReplace && include.has("investments")) {
      const investmentIds = new Set(s.investments.filter((item) => item.user_id === targetUserId).map((item) => item.id));
      s.investments = s.investments.filter((item) => item.user_id !== targetUserId);
      s.investment_value_history = s.investment_value_history.filter((item) => !investmentIds.has(item.investment_id));
      s.investment_withdrawals = s.investment_withdrawals.filter((item) => !investmentIds.has(item.investment_id));
    }
    if (shouldReplace && include.has("loans")) {
      const loanIds = new Set(s.loans.filter((item) => item.user_id === targetUserId).map((item) => item.id));
      s.loans = s.loans.filter((item) => item.user_id !== targetUserId);
      s.loan_payments = s.loan_payments.filter((item) => !loanIds.has(item.loan_id));
    }

    const ensureFallbackMemberId = () => {
      let fallback = s.members.find((member) => member.user_id === targetUserId)?.id;
      if (!fallback) {
        fallback = generateId();
        s.members.push({
          id: fallback,
          user_id: targetUserId,
          name: "Self",
          relation: "Self",
          color: "#10B981",
          created_at: nowIso(),
        });
      }
      return fallback;
    };

    const memberIdMap = new Map<string, string>();
    const fallbackMemberId = ensureFallbackMemberId();

    const resolveMemberId = (sourceMemberId?: string) => {
      if (!sourceMemberId) return fallbackMemberId;
      const mapped = memberIdMap.get(sourceMemberId);
      if (mapped) return mapped;

      const sourceMember = sourceMembers.find((member) => member.id === sourceMemberId);
      if (sourceMember) {
        const existing = s.members.find(
          (member) =>
            member.user_id === targetUserId &&
            member.name === sourceMember.name &&
            (member.relation || null) === (sourceMember.relation || null)
        );
        if (existing) {
          memberIdMap.set(sourceMemberId, existing.id);
          return existing.id;
        }
      }

      return fallbackMemberId;
    };

    if (include.has("members")) {
      const importedMembers = sourceMembers.length ? sourceMembers : [];
      if (!importedMembers.length) {
        memberIdMap.set("__fallback__", fallbackMemberId);
      }
      for (const member of importedMembers) {
        const nextId = generateId();
        memberIdMap.set(member.id, nextId);
        s.members.push({
          ...member,
          id: nextId,
          user_id: targetUserId,
        });
      }
    }

    if (include.has("categories")) {
      for (const category of sourceCategories) {
        const exists = s.categories.some(
          (item) => item.user_id === targetUserId && item.type === category.type && item.name.toLowerCase() === category.name.toLowerCase()
        );
        if (exists) continue;
        s.categories.push({
          ...category,
          id: generateId(),
          user_id: targetUserId,
        });
      }
    }

    const tagIdMap = new Map<string, string>();
    if (include.has("tags")) {
      for (const tag of sourceTags) {
        const existing = s.tags.find(
          (item) => item.user_id === targetUserId && item.name.toLowerCase() === tag.name.toLowerCase()
        );
        if (existing) {
          tagIdMap.set(tag.id, existing.id);
          continue;
        }
        const nextId = generateId();
        tagIdMap.set(tag.id, nextId);
        s.tags.push({
          ...tag,
          id: nextId,
          user_id: targetUserId,
        });
      }
    }

    // Tags weren't necessarily part of this import — drop references we can't resolve
    // rather than fabricating a fallback (unlike member_id, tag_ids can safely be empty).
    const resolveTagIds = (sourceTagIds?: string[]) => {
      if (!Array.isArray(sourceTagIds) || !tagIdMap.size) return [];
      return sourceTagIds.map((id) => tagIdMap.get(id)).filter((id): id is string => !!id);
    };

    if (include.has("category_rules")) {
      for (const rule of sourceCategoryRules) {
        const exists = s.category_rules.some(
          (item) =>
            item.user_id === targetUserId &&
            item.category_type === rule.category_type &&
            item.keyword.toLowerCase() === rule.keyword.toLowerCase()
        );
        if (exists) continue;
        s.category_rules.push({
          ...rule,
          id: generateId(),
          user_id: targetUserId,
          tag_ids: resolveTagIds(rule.tag_ids),
        });
      }
    }

    const transactionIdMap = new Map<string, string>();
    if (include.has("transactions")) {
      for (const tx of sourceTransactions) {
        const nextId = generateId();
        transactionIdMap.set(tx.id, nextId);
        s.transactions.push({
          ...tx,
          id: nextId,
          user_id: targetUserId,
          member_id: resolveMemberId(tx.member_id),
          tag_ids: resolveTagIds(tx.tag_ids),
        });
      }
    }

    const investmentIdMap = new Map<string, string>();
    if (include.has("investments")) {
      for (const inv of sourceInvestments) {
        const nextId = generateId();
        investmentIdMap.set(inv.id, nextId);
        s.investments.push({
          ...inv,
          id: nextId,
          user_id: targetUserId,
          member_id: resolveMemberId(inv.member_id),
        });
      }

      for (const history of sourceInvestmentHistory) {
        const mappedInvestmentId = investmentIdMap.get(history.investment_id);
        if (!mappedInvestmentId) continue;
        s.investment_value_history.push({
          ...history,
          id: generateId(),
          investment_id: mappedInvestmentId,
        });
      }

      for (const withdrawal of sourceInvestmentWithdrawals) {
        const mappedInvestmentId = investmentIdMap.get(withdrawal.investment_id);
        if (!mappedInvestmentId) continue;
        s.investment_withdrawals.push({
          ...withdrawal,
          id: generateId(),
          investment_id: mappedInvestmentId,
          income_tx_id: withdrawal.income_tx_id ? transactionIdMap.get(withdrawal.income_tx_id) || null : null,
        });
      }
    }

    const loanIdMap = new Map<string, string>();
    if (include.has("loans")) {
      for (const loan of sourceLoans) {
        const nextId = generateId();
        loanIdMap.set(loan.id, nextId);
        s.loans.push({
          ...loan,
          id: nextId,
          user_id: targetUserId,
          member_id: resolveMemberId(loan.member_id),
        });
      }

      for (const payment of sourceLoanPayments) {
        const mappedLoanId = loanIdMap.get(payment.loan_id);
        if (!mappedLoanId) continue;
        s.loan_payments.push({
          ...payment,
          id: generateId(),
          loan_id: mappedLoanId,
        });
      }
    }
  });
}

export async function createMember(userId: string, name: string, relation?: string, color?: string) {
  const memberId = generateId();
  const doc: Member = {
    id: memberId,
    user_id: userId,
    name,
    relation: relation || null,
    color: color || "#FAFAFA",
    created_at: nowIso(),
  };
  await mutateDb(async (s) => {
    s.members.push(doc);
  });
  return memberId;
}

export async function getMembers(userId: string) {
  const state = await loadDb();
  return state.members.filter((m) => m.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateMember(memberId: string, userId: string, name: string, relation?: string, color?: string) {
  await mutateDb(async (s) => {
    const m = s.members.find((x) => x.id === memberId && x.user_id === userId);
    if (!m) return;
    m.name = name;
    m.relation = relation || null;
    m.color = color || null;
  });
}

export async function deleteMember(memberId: string, userId: string) {
  await mutateDb(async (s) => {
    s.members = s.members.filter((m) => !(m.id === memberId && m.user_id === userId));
  });
}

export async function createCategory(userId: string, name: string, type: TxType) {
  const state = await loadDb();
  const exists = state.categories.find(
    (c) => c.user_id === userId && c.type === type && c.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) return exists.id;

  const categoryId = generateId();
  const doc: Category = {
    id: categoryId,
    user_id: userId,
    name,
    type,
    created_at: nowIso(),
  };
  await mutateDb(async (s) => {
    s.categories.push(doc);
  });
  return categoryId;
}

export async function getCategories(userId: string) {
  const state = await loadDb();
  return state.categories
    .filter((c) => c.user_id === userId)
    .sort((a, b) => `${a.type}-${a.name}`.localeCompare(`${b.type}-${b.name}`));
}

export async function updateCategory(categoryId: string, userId: string, name: string, type: TxType) {
  await mutateDb(async (s) => {
    const c = s.categories.find((x) => x.id === categoryId && x.user_id === userId);
    if (!c) return;
    c.name = name;
    c.type = type;
  });
}

export async function deleteCategory(categoryId: string, userId: string) {
  // Categories are stored as plain text on each transaction, not by reference,
  // so deleting one never orphans anything — existing transactions keep their text.
  await mutateDb(async (s) => {
    s.categories = s.categories.filter((c) => !(c.id === categoryId && c.user_id === userId));
  });
}

export async function createTag(userId: string, name: string) {
  const state = await loadDb();
  const exists = state.tags.find((t) => t.user_id === userId && t.name.toLowerCase() === name.toLowerCase());
  if (exists) return exists.id;

  const tagId = generateId();
  const doc: Tag = {
    id: tagId,
    user_id: userId,
    name,
    created_at: nowIso(),
  };
  await mutateDb(async (s) => {
    s.tags.push(doc);
  });
  return tagId;
}

export async function getTags(userId: string) {
  const state = await loadDb();
  return state.tags.filter((t) => t.user_id === userId).sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateTag(tagId: string, userId: string, name: string) {
  await mutateDb(async (s) => {
    const t = s.tags.find((x) => x.id === tagId && x.user_id === userId);
    if (!t) return;
    t.name = name;
  });
}

export async function deleteTag(tagId: string, userId: string) {
  // Unlike categories, tags are referenced by id on each transaction — strip the
  // dangling reference everywhere it's used so the UI never has to handle it.
  await mutateDb(async (s) => {
    s.tags = s.tags.filter((t) => !(t.id === tagId && t.user_id === userId));
    for (const tx of s.transactions) {
      if (tx.user_id === userId && tx.tag_ids?.includes(tagId)) {
        tx.tag_ids = tx.tag_ids.filter((id) => id !== tagId);
      }
    }
  });
}

export async function upsertCategoryRule(
  userId: string,
  keyword: string,
  category: string,
  categoryType: TxType,
  tagIds: string[]
) {
  const state = await loadDb();
  const existing = state.category_rules.find(
    (r) => r.user_id === userId && r.category_type === categoryType && r.keyword.toLowerCase() === keyword.toLowerCase()
  );

  if (existing) {
    await mutateDb(async (s) => {
      const rule = s.category_rules.find((r) => r.id === existing.id);
      if (!rule) return;
      rule.keyword = keyword;
      rule.category = category;
      rule.tag_ids = tagIds;
    });
    return existing.id;
  }

  const ruleId = generateId();
  await mutateDb(async (s) => {
    s.category_rules.push({
      id: ruleId,
      user_id: userId,
      keyword,
      category,
      category_type: categoryType,
      tag_ids: tagIds,
      created_at: nowIso(),
    });
  });
  return ruleId;
}

export async function getCategoryRules(userId: string) {
  const state = await loadDb();
  return state.category_rules.filter((r) => r.user_id === userId).sort((a, b) => a.keyword.localeCompare(b.keyword));
}

export async function updateCategoryRule(
  ruleId: string,
  userId: string,
  keyword: string,
  category: string,
  categoryType: TxType,
  tagIds: string[]
) {
  await mutateDb(async (s) => {
    const rule = s.category_rules.find((r) => r.id === ruleId && r.user_id === userId);
    if (!rule) return;
    rule.keyword = keyword;
    rule.category = category;
    rule.category_type = categoryType;
    rule.tag_ids = tagIds;
  });
}

export async function deleteCategoryRule(ruleId: string, userId: string) {
  await mutateDb(async (s) => {
    s.category_rules = s.category_rules.filter((r) => !(r.id === ruleId && r.user_id === userId));
  });
}

export async function applyCategoryRuleToExisting(
  userId: string,
  keyword: string,
  category: string,
  categoryType: TxType,
  tagIds: string[]
) {
  let updated = 0;
  await mutateDb(async (s) => {
    for (const tx of s.transactions) {
      if (tx.user_id !== userId || tx.type !== categoryType) continue;
      if (!notesMatchKeyword(tx.notes || "", keyword)) continue;
      tx.category = category;
      tx.tag_ids = tagIds;
      updated += 1;
    }
  });
  return updated;
}

export async function createTransaction(
  userId: string,
  type: TxType,
  amount: number,
  category: string,
  date: string,
  memberId: string,
  notes?: string,
  tagIds: string[] = []
) {
  const txId = generateId();
  const doc: Transaction = {
    id: txId,
    user_id: userId,
    type,
    amount: Number(amount) || 0,
    category,
    date,
    notes: notes || null,
    member_id: memberId,
    tag_ids: tagIds,
    created_at: nowIso(),
  };
  await mutateDb(async (s) => {
    s.transactions.push(doc);
  });
  return txId;
}

export async function getTransactions(
  userId: string,
  options?: {
    memberIds?: string[];
    type?: TxType;
    category?: string;
    startDate?: string;
    endDate?: string;
    tagIds?: string[];
  }
) {
  const state = await loadDb();
  return state.transactions
    .filter((t) => t.user_id === userId)
    .filter((t) => (options?.memberIds?.length ? options.memberIds.includes(t.member_id) : true))
    .filter((t) => (options?.type ? t.type === options.type : true))
    .filter((t) => (options?.category ? t.category === options.category : true))
    .filter((t) => (options?.startDate ? t.date >= options.startDate : true))
    .filter((t) => (options?.endDate ? t.date <= options.endDate : true))
    .filter((t) => (options?.tagIds?.length ? (t.tag_ids || []).some((id) => options.tagIds!.includes(id)) : true))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTransactionById(transactionId: string, userId: string) {
  const state = await loadDb();
  return state.transactions.find((t) => t.id === transactionId && t.user_id === userId) || null;
}

export async function updateTransaction(
  transactionId: string,
  userId: string,
  type: TxType,
  amount: number,
  category: string,
  date: string,
  memberId: string,
  notes?: string,
  tagIds: string[] = []
) {
  await mutateDb(async (s) => {
    const t = s.transactions.find((x) => x.id === transactionId && x.user_id === userId);
    if (!t) return;
    t.type = type;
    t.amount = Number(amount) || 0;
    t.category = category;
    t.date = date;
    t.member_id = memberId;
    t.notes = notes || null;
    t.tag_ids = tagIds;
  });
}

export async function deleteTransaction(transactionId: string, userId: string) {
  await mutateDb(async (s) => {
    s.transactions = s.transactions.filter((t) => !(t.id === transactionId && t.user_id === userId));
  });
}

function monthDiffInclusive(startDate: string, endDate: string) {
  try {
    const s = new Date(startDate.slice(0, 10));
    const e = new Date(endDate.slice(0, 10));
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  } catch {
    return 0;
  }
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthIndex(key: string) {
  const [y, m] = String(key).split("-").map((v) => Number(v));
  if (!y || !m) return 0;
  return y * 12 + (m - 1);
}

function monthDiffExclusiveCurrent(startDate: string, endDate: string) {
  try {
    const s = new Date(startDate.slice(0, 10));
    const e = new Date(endDate.slice(0, 10));
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
  } catch {
    return 0;
  }
}

async function enrichInvestment(inv: Investment) {
  const state = await loadDb();
  const history = state.investment_value_history
    .filter((h) => h.investment_id === inv.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const withdrawals = state.investment_withdrawals
    .filter((w) => w.investment_id === inv.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalWithdrawn = withdrawals.reduce((s, w) => s + (w.amount || 0), 0);

  let totalInvested = inv.amount || 0;
  let currentValue = inv.current_value ?? inv.amount ?? 0;

  if (inv.type === "onetime") {
    totalInvested = Math.max(0, (inv.amount || 0) - totalWithdrawn);
    if (history.length) {
      currentValue = history[history.length - 1].current_value;
    } else {
      // Backward-compatibility for older withdrawals recorded before current_value updates were added.
      const baseCurrent = inv.current_value ?? inv.amount ?? 0;
      currentValue = Math.max(0, baseCurrent - totalWithdrawn);
    }
  } else if (inv.type === "recurring") {
    if (inv.status === "closed" && inv.end_date) {
      totalInvested = (inv.amount || 0) * monthDiffInclusive(inv.start_date, inv.end_date);
    } else {
      const now = new Date();
      const nowKey = monthKey(now);
      const start = new Date(inv.start_date.slice(0, 10));
      const startKey = monthKey(start);
      const installmentsBeforeCurrent = monthDiffExclusiveCurrent(inv.start_date, ymdNow());

      const paidCurrentMonth = state.transactions.some(
        (t) =>
          t.user_id === inv.user_id &&
          t.type === "expense" &&
          t.category === "SIP" &&
          t.member_id === inv.member_id &&
          String(t.notes || "").includes(`[AUTO_SIP:${inv.id}:${nowKey}]`)
      );

      // Guard future start dates so we never count installments before the plan starts.
      const isStarted = monthIndex(nowKey) >= monthIndex(startKey);
      totalInvested = (inv.amount || 0) * (isStarted ? installmentsBeforeCurrent + (paidCurrentMonth ? 1 : 0) : 0);
    }

    if (history.length) {
      currentValue = history[history.length - 1].current_value;
    } else {
      currentValue = inv.current_value ?? totalInvested;
    }
  } else {
    totalInvested = inv.amount || 0;
    if (history.length) currentValue = history[history.length - 1].current_value;
  }

  return {
    ...inv,
    total_invested: totalInvested,
    total_withdrawn: totalWithdrawn,
    current_value: currentValue,
    profit_loss: (currentValue || 0) - (totalInvested || 0),
    value_history: history,
    withdrawals,
  };
}

export async function createInvestment(
  userId: string,
  memberId: string,
  name: string,
  type: InvestType,
  amount: number,
  startDate: string,
  currentValue?: number,
  maturityDate?: string,
  endDate?: string,
  expectedReturn?: number,
  expectedReturnType?: "percent" | "amount",
  notes?: string
) {
  const invId = generateId();
  const doc: Investment = {
    id: invId,
    user_id: userId,
    member_id: memberId,
    name,
    type,
    amount: Number(amount) || 0,
    current_value: currentValue ?? null,
    start_date: startDate,
    maturity_date: maturityDate || null,
    end_date: endDate || null,
    expected_return: expectedReturn ?? null,
    expected_return_type: expectedReturnType || "percent",
    notes: notes || null,
    status: "active",
    created_at: nowIso(),
  };

  await mutateDb(async (s) => {
    s.investments.push(doc);
    if (type === "dynamic" && typeof currentValue === "number") {
      s.investment_value_history.push({
        id: generateId(),
        investment_id: invId,
        date: startDate,
        current_value: currentValue,
        created_at: nowIso(),
      });
    }
  });

  return invId;
}

export async function getInvestments(userId: string, memberIds?: string[]) {
  const state = await loadDb();
  const items = state.investments
    .filter((i) => i.user_id === userId)
    .filter((i) => (memberIds?.length ? memberIds.includes(i.member_id) : true))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return Promise.all(items.map((i) => enrichInvestment(i)));
}

export async function getInvestmentById(investmentId: string, userId: string) {
  const state = await loadDb();
  const inv = state.investments.find((i) => i.id === investmentId && i.user_id === userId);
  if (!inv) return null;
  return enrichInvestment(inv);
}

export async function updateInvestment(investmentId: string, userId: string, updates: Partial<any>) {
  await mutateDb(async (s) => {
    const inv = s.investments.find((i) => i.id === investmentId && i.user_id === userId);
    if (!inv) return;

    const hasCurrentValueUpdate = Object.prototype.hasOwnProperty.call(updates, "current_value");
    const nextCurrentValue = hasCurrentValueUpdate ? Number(updates.current_value) || 0 : null;
    const previousCurrentValue = inv.current_value ?? null;

    Object.assign(inv, updates);

    if (hasCurrentValueUpdate) {
      s.investment_value_history.push({
        id: generateId(),
        investment_id: investmentId,
        date: ymdNow(),
        current_value: nextCurrentValue,
        created_at: nowIso(),
      });
      inv.current_value = nextCurrentValue;
    } else if (previousCurrentValue != null) {
      inv.current_value = previousCurrentValue;
    }
  });
}

export async function deleteInvestment(investmentId: string, userId: string) {
  await mutateDb(async (s) => {
    s.investments = s.investments.filter((i) => !(i.id === investmentId && i.user_id === userId));
    s.investment_value_history = s.investment_value_history.filter((h) => h.investment_id !== investmentId);
    s.investment_withdrawals = s.investment_withdrawals.filter((w) => w.investment_id !== investmentId);
  });
}

export async function addInvestmentValue(investmentId: string, date: string, currentValue: number) {
  await mutateDb(async (s) => {
    s.investment_value_history.push({
      id: generateId(),
      investment_id: investmentId,
      date,
      current_value: Number(currentValue) || 0,
      created_at: nowIso(),
    });
    const inv = s.investments.find((i) => i.id === investmentId);
    if (inv) inv.current_value = Number(currentValue) || 0;
  });
}

export async function addInvestmentWithdrawal(
  investmentId: string,
  userId: string,
  amount: number,
  date: string,
  notes?: string,
  addToIncome?: boolean
) {
  await mutateDb(async (s) => {
    const withdrawalAmount = Number(amount) || 0;
    let incomeTxId: string | null = null;
    const inv = s.investments.find((i) => i.id === investmentId && i.user_id === userId);

    if (addToIncome && inv) {
      incomeTxId = generateId();
      s.transactions.push({
        id: incomeTxId,
        user_id: userId,
        type: "income",
        amount: withdrawalAmount,
        category: "Investment Withdrawal",
        date,
        notes: `Withdrawal from ${inv.name}`,
        member_id: inv.member_id,
        tag_ids: [],
        created_at: nowIso(),
      });
    }

    s.investment_withdrawals.push({
      id: generateId(),
      investment_id: investmentId,
      amount: withdrawalAmount,
      date,
      notes: notes || null,
      income_tx_id: incomeTxId,
      created_at: nowIso(),
    });

    if (inv) {
      const baseCurrent = inv.current_value ?? inv.amount ?? 0;
      const nextCurrent = Math.max(0, baseCurrent - withdrawalAmount);
      inv.current_value = nextCurrent;

      // Keep value timeline consistent so cards/details reflect post-withdrawal value.
      s.investment_value_history.push({
        id: generateId(),
        investment_id: investmentId,
        date,
        current_value: nextCurrent,
        created_at: nowIso(),
      });
    }
  });
}

async function enrichLoan(loan: Loan) {
  const state = await loadDb();
  const payments = state.loan_payments
    .filter((p) => p.loan_id === loan.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const now = new Date();
  const nowMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const emiByMonth = new Map<string, number>();
  for (const payment of payments) {
    if ((payment.type || "emi") !== "emi") continue;
    const monthKey = String(payment.date || "").slice(0, 7);
    emiByMonth.set(monthKey, (emiByMonth.get(monthKey) || 0) + (payment.amount || 0));
  }

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPayable = (loan.emi || 0) * (loan.tenure_months || 0);
  const remainingBalance = Math.max(0, (loan.total_amount || 0) - totalPaid);
  const remainingPayable = Math.max(0, totalPayable - totalPaid);

  let monthsElapsed = 0;
  let installmentsGoneBeforeCurrent = 0;
  try {
    const sd = new Date(loan.start_date.slice(0, 10));
    monthsElapsed = (now.getFullYear() - sd.getFullYear()) * 12 + (now.getMonth() - sd.getMonth());
    monthsElapsed = Math.max(0, Math.min(monthsElapsed, loan.tenure_months || 0));
    installmentsGoneBeforeCurrent = monthsElapsed;
  } catch {
    monthsElapsed = 0;
    installmentsGoneBeforeCurrent = 0;
  }

  const currentMonthPaid = (emiByMonth.get(nowMonthKey) || 0) > 0;
  const expectedInstallmentCount = Math.min(
    loan.tenure_months || 0,
    installmentsGoneBeforeCurrent + (currentMonthPaid ? 1 : 0)
  );
  const expectedPaidToDate = Math.min(totalPayable, (loan.emi || 0) * expectedInstallmentCount);
  const expectedRemaining = Math.max(0, totalPayable - expectedPaidToDate);

  const expectedInstallments = Array.from({ length: expectedInstallmentCount }, (_, index) => {
    const sd = new Date(loan.start_date.slice(0, 10));
    const monthDate = new Date(sd.getFullYear(), sd.getMonth() + index, 1);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const day = Math.min(sd.getDate(), 28);
    const date = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
      month_key: monthKey,
      date,
      amount: loan.emi || 0,
      recorded_amount: emiByMonth.get(monthKey) || 0,
      status: (emiByMonth.get(monthKey) || 0) > 0 ? "recorded" : "expected",
    };
  });

  let endDate: string | null = null;
  try {
    const sd = new Date(loan.start_date.slice(0, 10));
    const monthOffset = Math.max(0, (loan.tenure_months || 0) - 1);
    const m = sd.getMonth() + monthOffset;
    const y = sd.getFullYear() + Math.floor(m / 12);
    const month = (m % 12) + 1;
    const day = Math.min(sd.getDate(), 28);
    endDate = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    endDate = null;
  }

  return {
    ...loan,
    total_paid: totalPaid,
    total_payable: totalPayable,
    remaining_balance: remainingBalance,
    remaining_payable: remainingPayable,
    months_elapsed: monthsElapsed,
    installments_gone_before_current: installmentsGoneBeforeCurrent,
    current_month_paid: currentMonthPaid,
    expected_paid_to_date: expectedPaidToDate,
    expected_remaining: expectedRemaining,
    expected_installments: expectedInstallments,
    end_date: endDate,
    status: remainingPayable <= 0 ? "closed" : loan.status,
    payments,
  };
}

export async function createLoan(
  userId: string,
  memberId: string,
  name: string,
  totalAmount: number,
  interestRate: number,
  emi: number,
  tenureMonths: number,
  startDate: string,
  notes?: string
) {
  const loanId = generateId();
  const doc: Loan = {
    id: loanId,
    user_id: userId,
    member_id: memberId,
    name,
    total_amount: Number(totalAmount) || 0,
    interest_rate: Number(interestRate) || 0,
    emi: Number(emi) || 0,
    tenure_months: Number(tenureMonths) || 0,
    start_date: startDate,
    notes: notes || null,
    status: "active",
    created_at: nowIso(),
  };
  await mutateDb(async (s) => {
    s.loans.push(doc);
  });
  return loanId;
}

export async function getLoans(userId: string, memberIds?: string[]) {
  const state = await loadDb();
  const loans = state.loans
    .filter((l) => l.user_id === userId)
    .filter((l) => (memberIds?.length ? memberIds.includes(l.member_id) : true))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return Promise.all(loans.map((l) => enrichLoan(l)));
}

export async function getLoanById(loanId: string, userId: string) {
  const state = await loadDb();
  const loan = state.loans.find((l) => l.id === loanId && l.user_id === userId);
  if (!loan) return null;
  return enrichLoan(loan);
}

export async function updateLoan(loanId: string, userId: string, updates: Partial<any>) {
  await mutateDb(async (s) => {
    const loan = s.loans.find((l) => l.id === loanId && l.user_id === userId);
    if (!loan) return;
    Object.assign(loan, updates);
  });
}

export async function deleteLoan(loanId: string, userId: string) {
  await mutateDb(async (s) => {
    s.loans = s.loans.filter((l) => !(l.id === loanId && l.user_id === userId));
    s.loan_payments = s.loan_payments.filter((p) => p.loan_id !== loanId);
  });
}

export async function addLoanPayment(
  loanId: string,
  amount: number,
  date: string,
  type: LoanPayType = "emi",
  notes?: string
) {
  await mutateDb(async (s) => {
    s.loan_payments.push({
      id: generateId(),
      loan_id: loanId,
      amount: Number(amount) || 0,
      date,
      type,
      notes: notes || null,
      created_at: nowIso(),
    });
  });
}

export async function getDashboardStats(
  userId: string,
  memberIds?: string[],
  startDate?: string,
  endDate?: string
) {
  const txs = await getTransactions(userId, {
    memberIds,
    startDate,
    endDate,
  });

  const investments = await getInvestments(userId, memberIds);
  const loans = await getLoans(userId, memberIds);

  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount || 0), 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount || 0), 0);
  const saved = income - expense;
  const currentBalance = saved;

  const expenseMap: Record<string, number> = {};
  const incomeMap: Record<string, number> = {};
  for (const t of txs) {
    if (t.type === "expense") expenseMap[t.category] = (expenseMap[t.category] || 0) + t.amount;
    if (t.type === "income") incomeMap[t.category] = (incomeMap[t.category] || 0) + t.amount;
  }

  const activeInvestments = investments.filter((i: any) => (i.status || "active") !== "closed");
  const activeLoans = loans.filter((l: any) => (l.status || "active") !== "closed");

  const portfolioValue = activeInvestments.reduce((s: number, i: any) => s + (i.current_value || 0), 0);
  const loanOutstanding = activeLoans.reduce((sum: number, loan: any) => {
    const useExpected = (loan.expected_paid_to_date || 0) > (loan.total_paid || 0);
    const displayRemaining = useExpected
      ? (loan.expected_remaining ?? loan.remaining_payable ?? loan.remaining_balance ?? 0)
      : (loan.remaining_payable ?? loan.remaining_balance ?? 0);
    return sum + displayRemaining;
  }, 0);
  const netWorth = portfolioValue - loanOutstanding + saved;

  const emiByLoan = activeLoans.map((l: any) => ({ id: l.id, name: l.name, amount: l.emi || 0 }));
  const sipByInvestment = activeInvestments
    .filter((i: any) => i.type === "recurring")
    .map((i: any) => ({ id: i.id, name: i.name, amount: i.amount || 0 }));

  return {
    income,
    expense,
    saved,
    current_balance: currentBalance,
    net_worth: netWorth,
    portfolio_value: portfolioValue,
    loan_outstanding: loanOutstanding,
    total_invested: activeInvestments.reduce((s: number, i: any) => s + (i.total_invested || 0), 0),
    active_investments: activeInvestments.length,
    active_loans: activeLoans.length,
    breakdown: {
      expense: Object.entries(expenseMap).map(([category, amount]) => ({ category, amount })),
      income: Object.entries(incomeMap).map(([category, amount]) => ({ category, amount })),
      emi_by_loan: emiByLoan,
      sip_by_investment: sipByInvestment,
    },
    investments: {
      total_invested: activeInvestments.reduce((s: number, i: any) => s + (i.total_invested || 0), 0),
      portfolio_value: portfolioValue,
      profit_loss: activeInvestments.reduce((s: number, i: any) => s + (i.profit_loss || 0), 0),
    },
    loans: {
      total_amount: loans.reduce((s: number, l: any) => s + (l.total_amount || 0), 0),
      outstanding: loanOutstanding,
    },
  };
}
