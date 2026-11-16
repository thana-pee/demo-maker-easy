import {
  ensureWalletViaRest,
  getServerBillingConfig,
  getServiceRoleHeaders,
  insertCreditTransactionViaRest,
  patchUserWalletViaRest,
  type FetchLike,
  type ServerBillingConfig,
  type WalletBalanceSummary,
} from './serverWallet';

export interface AdminTopupKpi {
  totalTopupRevenueThb: number;
  totalPurchasedCreditsInCirculation: number;
  totalTrialCreditsInCirculation: number;
  totalTopupCreditsGranted: number;
  totalPayingUsers: number;
  totalRegisteredUsers: number;
}

export interface AdminTopSpender {
  rank: number;
  userId: string;
  email: string;
  displayName: string;
  totalPaidThb: number;
  totalCreditsToppedUp: number;
  currentBalance: number;
  currentPurchased: number;
  currentTrial: number;
  topupCount: number;
  lastTopupAt: string | null;
}

export interface AdminRecentTopup {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  amount: number;
  txType: string;
  description: string;
  transRef?: string | null;
  createdAt: string;
  isManual: boolean;
}

export interface AdminUserLookupItem {
  id: string;
  email: string;
  displayName: string;
  currentBalance: number;
  purchasedCredits: number;
  trialCredits: number;
  createdAt?: string;
  lastSignInAt?: string;
}

export interface AdminTopupDashboardReport {
  kpi: AdminTopupKpi;
  topSpenders: AdminTopSpender[];
  recentTopups: AdminRecentTopup[];
  users: AdminUserLookupItem[];
}

export interface RawAuthUser {
  id: string;
  email?: string;
  raw_user_meta_data?: { full_name?: string; name?: string };
  user_metadata?: { full_name?: string; name?: string };
  created_at?: string;
  last_sign_in_at?: string;
}

export interface RawWalletRow {
  user_id: string;
  trial_credits?: number;
  purchased_credits?: number;
  updated_at?: string;
}

export interface RawTxRow {
  id?: string;
  user_id: string;
  tx_type: string;
  amount: number;
  description?: string;
  trans_ref?: string | null;
  created_at?: string;
}

export interface RawOrderRow {
  id?: string;
  user_id: string;
  package_id?: string;
  expected_amount_thb?: number;
  credits_to_grant?: number;
  status?: string;
  created_at?: string;
}

export function extractUserDisplayName(user?: RawAuthUser, fallbackEmail?: string): string {
  if (!user && !fallbackEmail) return 'Unknown Member';
  const meta = user?.user_metadata || user?.raw_user_meta_data;
  if (meta?.full_name?.trim()) return meta.full_name.trim();
  if (meta?.name?.trim()) return meta.name.trim();
  const email = user?.email || fallbackEmail;
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return email || (user?.id ? `User ${user.id.slice(0, 8)}` : 'Studio Member');
}

/** Pure function to aggregate KPI, Top Spenders, Recent Topups and User Directory */
export function summarizeTopupDashboard(params: {
  users?: RawAuthUser[];
  wallets?: RawWalletRow[];
  transactions?: RawTxRow[];
  orders?: RawOrderRow[];
}): AdminTopupDashboardReport {
  const usersList = params.users ?? [];
  const walletsList = params.wallets ?? [];
  const txList = params.transactions ?? [];
  const ordersList = params.orders ?? [];

  // 1. Build User map
  const userMap = new Map<string, { email: string; displayName: string; createdAt?: string; lastSignInAt?: string }>();
  for (const u of usersList) {
    if (!u.id) continue;
    const email = (u.email || '').trim().toLowerCase();
    const displayName = extractUserDisplayName(u, email);
    userMap.set(u.id, {
      email,
      displayName,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
    });
  }

  // 2. Build Wallet map
  const walletMap = new Map<string, { trial: number; purchased: number; updatedAt?: string }>();
  let totalPurchasedInCirculation = 0;
  let totalTrialInCirculation = 0;

  for (const w of walletsList) {
    if (!w.user_id) continue;
    const trial = Math.max(0, Number(w.trial_credits ?? 0));
    const purchased = Math.max(0, Number(w.purchased_credits ?? 0));
    walletMap.set(w.user_id, { trial, purchased, updatedAt: w.updated_at });
    totalPurchasedInCirculation += purchased;
    totalTrialInCirculation += trial;
  }

  // 3. Aggregate Orders (Paid Revenue THB)
  const paidOrdersByUser = new Map<string, { totalThb: number; count: number; lastPaidAt?: string }>();
  let totalRevenueThb = 0;

  for (const ord of ordersList) {
    if (!ord.user_id) continue;
    if (ord.status === 'paid') {
      const thb = Math.max(0, Number(ord.expected_amount_thb ?? 0));
      totalRevenueThb += thb;
      const current = paidOrdersByUser.get(ord.user_id) ?? { totalThb: 0, count: 0 };
      current.totalThb += thb;
      current.count += 1;
      if (ord.created_at && (!current.lastPaidAt || ord.created_at > current.lastPaidAt)) {
        current.lastPaidAt = ord.created_at;
      }
      paidOrdersByUser.set(ord.user_id, current);
    }
  }

  // 4. Aggregate Transactions (Credits granted & Top-up history)
  const topupsByUser = new Map<
    string,
    {
      totalCredits: number;
      count: number;
      lastTopupAt?: string;
    }
  >();
  let totalCreditsGranted = 0;

  const recentTopupsList: AdminRecentTopup[] = [];

  for (const tx of txList) {
    if (!tx.user_id) continue;
    const isTopupTx = tx.tx_type === 'topup';
    const isManualGrant =
      tx.tx_type === 'grant_trial' &&
      Boolean(tx.description && tx.description.toLowerCase().includes('admin manual'));

    if (isTopupTx) {
      const amt = Math.max(0, Number(tx.amount || 0));
      totalCreditsGranted += amt;

      const agg = topupsByUser.get(tx.user_id) ?? { totalCredits: 0, count: 0 };
      agg.totalCredits += amt;
      agg.count += 1;
      if (tx.created_at && (!agg.lastTopupAt || tx.created_at > agg.lastTopupAt)) {
        agg.lastTopupAt = tx.created_at;
      }
      topupsByUser.set(tx.user_id, agg);
    }

    if (isTopupTx || isManualGrant) {
      const userInfo = userMap.get(tx.user_id);
      const isManual =
        Boolean(tx.description && tx.description.toLowerCase().includes('admin manual')) ||
        Boolean(tx.description && tx.description.toLowerCase().includes('manual')) ||
        !tx.trans_ref;

      recentTopupsList.push({
        id: String(tx.id || `tx_${Math.random().toString(36).slice(2)}`),
        userId: tx.user_id,
        email: userInfo?.email || (tx.user_id.includes('@') ? tx.user_id : ''),
        displayName: userInfo?.displayName || (userInfo?.email ? userInfo.email.split('@')[0] : `User ${tx.user_id.slice(0, 6)}`),
        amount: Number(tx.amount || 0),
        txType: tx.tx_type,
        description: tx.description || (isTopupTx ? 'PromptPay Top-Up' : 'Manual Grant'),
        transRef: tx.trans_ref ?? null,
        createdAt: tx.created_at || new Date().toISOString(),
        isManual,
      });
    }
  }

  // Sort recent topups descending by createdAt
  recentTopupsList.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
  const recentTopups = recentTopupsList.slice(0, 30);

  // 5. Build Top Spenders Leaderboard
  // Collect all unique user IDs across userMap, walletMap, topupsByUser, paidOrdersByUser
  const allUserIds = new Set<string>([
    ...userMap.keys(),
    ...walletMap.keys(),
    ...topupsByUser.keys(),
    ...paidOrdersByUser.keys(),
  ]);

  const spendersList: Omit<AdminTopSpender, 'rank'>[] = [];
  const payingUsersSet = new Set<string>();

  for (const uid of allUserIds) {
    const userInfo = userMap.get(uid);
    const wallet = walletMap.get(uid);
    const topupAgg = topupsByUser.get(uid);
    const orderAgg = paidOrdersByUser.get(uid);

    const totalCreditsToppedUp = topupAgg?.totalCredits ?? (wallet?.purchased ? wallet.purchased : 0);
    const totalPaidThb = orderAgg?.totalThb ?? 0;
    const currentPurchased = wallet?.purchased ?? 0;
    const currentTrial = wallet?.trial ?? 0;
    const currentBalance = currentPurchased + currentTrial;
    const topupCount = (topupAgg?.count ?? 0) + (orderAgg?.count ?? 0);

    const candidateDates = [topupAgg?.lastTopupAt, orderAgg?.lastPaidAt, wallet?.updatedAt].filter(Boolean) as string[];
    candidateDates.sort().reverse();
    const lastTopupAt = candidateDates[0] || null;

    if (totalCreditsToppedUp > 0 || totalPaidThb > 0) {
      payingUsersSet.add(uid);
      spendersList.push({
        userId: uid,
        email: userInfo?.email || '',
        displayName: userInfo?.displayName || (userInfo?.email ? userInfo.email.split('@')[0] : `User ${uid.slice(0, 8)}`),
        totalPaidThb,
        totalCreditsToppedUp,
        currentBalance,
        currentPurchased,
        currentTrial,
        topupCount: Math.max(1, topupCount),
        lastTopupAt,
      });
    }
  }

  // Sort spenders: highest credits topped up first, secondary highest paid THB, tertiary current balance
  spendersList.sort((a, b) => {
    if (b.totalCreditsToppedUp !== a.totalCreditsToppedUp) {
      return b.totalCreditsToppedUp - a.totalCreditsToppedUp;
    }
    if (b.totalPaidThb !== a.totalPaidThb) {
      return b.totalPaidThb - a.totalPaidThb;
    }
    return b.currentBalance - a.currentBalance;
  });

  const topSpenders: AdminTopSpender[] = spendersList.map((spender, index) => ({
    ...spender,
    rank: index + 1,
  }));

  // 6. User Directory for quick search/autocomplete
  const userDirectory: AdminUserLookupItem[] = [];
  for (const uid of allUserIds) {
    const userInfo = userMap.get(uid);
    const wallet = walletMap.get(uid);
    const trial = wallet?.trial ?? 0;
    const purchased = wallet?.purchased ?? 0;
    userDirectory.push({
      id: uid,
      email: userInfo?.email || '',
      displayName: userInfo?.displayName || (userInfo?.email ? userInfo.email.split('@')[0] : `User ${uid.slice(0, 8)}`),
      currentBalance: trial + purchased,
      purchasedCredits: purchased,
      trialCredits: trial,
      createdAt: userInfo?.createdAt,
      lastSignInAt: userInfo?.lastSignInAt,
    });
  }

  // Sort user directory by email or balance
  userDirectory.sort((a, b) => {
    if (b.currentBalance !== a.currentBalance) {
      return b.currentBalance - a.currentBalance;
    }
    return (a.email || '').localeCompare(b.email || '');
  });

  const kpi: AdminTopupKpi = {
    totalTopupRevenueThb: totalRevenueThb,
    totalPurchasedCreditsInCirculation: totalPurchasedInCirculation,
    totalTrialCreditsInCirculation: totalTrialInCirculation,
    totalTopupCreditsGranted: totalCreditsGranted,
    totalPayingUsers: payingUsersSet.size,
    totalRegisteredUsers: allUserIds.size,
  };

  return {
    kpi,
    topSpenders,
    recentTopups,
    users: userDirectory,
  };
}

/** Fetches raw data from Supabase Auth & DB tables and summarizes dashboard metrics */
export async function fetchAdminTopupDashboardData(options?: {
  fetchFn?: FetchLike;
  config?: ServerBillingConfig;
}): Promise<AdminTopupDashboardReport> {
  const config = options?.config ?? getServerBillingConfig();
  const fetchFn = options?.fetchFn ?? fetch;
  const headers = getServiceRoleHeaders(config);

  // 1. Fetch Users from Supabase Auth admin API (up to 200 users)
  let rawUsers: RawAuthUser[] = [];
  try {
    const authAdminHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    };
    const userRes = await fetchFn(
      `${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`,
      { headers: authAdminHeaders }
    );
    if (userRes.ok) {
      const data = (await userRes.json()) as { users?: RawAuthUser[] };
      if (Array.isArray(data.users)) {
        rawUsers = data.users;
      }
    }
  } catch {
    // Continue if auth admin endpoint fails
  }

  // 2. Fetch User Wallets
  let rawWallets: RawWalletRow[] = [];
  try {
    const walletRes = await fetchFn(
      `${config.supabaseUrl}/rest/v1/user_wallets?select=user_id,trial_credits,purchased_credits,updated_at&order=updated_at.desc&limit=500`,
      { headers }
    );
    if (walletRes.ok) {
      const data = (await walletRes.json()) as RawWalletRow[];
      if (Array.isArray(data)) {
        rawWallets = data;
      }
    }
  } catch {
    // Continue
  }

  // 3. Fetch Credit Transactions
  let rawTransactions: RawTxRow[] = [];
  try {
    const txRes = await fetchFn(
      `${config.supabaseUrl}/rest/v1/credit_transactions?select=id,user_id,tx_type,amount,description,trans_ref,created_at&order=created_at.desc&limit=300`,
      { headers }
    );
    if (txRes.ok) {
      const data = (await txRes.json()) as RawTxRow[];
      if (Array.isArray(data)) {
        rawTransactions = data;
      }
    }
  } catch {
    // Continue
  }

  // 4. Fetch Topup Orders (Paid status)
  let rawOrders: RawOrderRow[] = [];
  try {
    const orderRes = await fetchFn(
      `${config.supabaseUrl}/rest/v1/topup_orders?select=id,user_id,package_id,expected_amount_thb,credits_to_grant,status,created_at&status=eq.paid&order=created_at.desc&limit=300`,
      { headers }
    );
    if (orderRes.ok) {
      const data = (await orderRes.json()) as RawOrderRow[];
      if (Array.isArray(data)) {
        rawOrders = data;
      }
    }
  } catch {
    // Continue
  }

  return summarizeTopupDashboard({
    users: rawUsers,
    wallets: rawWallets,
    transactions: rawTransactions,
    orders: rawOrders,
  });
}

/** Executes an admin manual credit top-up safely and records an audit log */
export async function executeAdminManualTopup(params: {
  targetUserIdOrEmail: string;
  amount: number;
  creditType?: 'purchased' | 'trial';
  reason?: string;
  adminEmail?: string;
  config?: ServerBillingConfig;
  fetchFn?: FetchLike;
}): Promise<{
  success: boolean;
  status: number;
  error?: string;
  message?: string;
  targetUser?: { id: string; email: string; displayName: string };
  wallet?: WalletBalanceSummary;
}> {
  const config = params.config ?? getServerBillingConfig();
  const fetchFn = params.fetchFn ?? fetch;
  const targetInput = (params.targetUserIdOrEmail || '').trim();
  const amount = Math.round(Number(params.amount));
  const creditType = params.creditType === 'trial' ? 'trial' : 'purchased';
  const reason = (params.reason || '').trim() || 'Admin manual credit adjustment';
  const adminEmail = (params.adminEmail || '').trim();

  if (!targetInput) {
    return {
      success: false,
      status: 400,
      error: 'กรุณาระบุอีเมล หรือ User ID ของผู้ใช้ที่ต้องการเติมเครดิต',
    };
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return {
      success: false,
      status: 400,
      error: 'จำนวนเครดิตต้องเป็นจำนวนเต็มบวกระหว่าง 1 ถึง 100,000 เหรียญ',
    };
  }

  const headers = getServiceRoleHeaders(config);

  // 1. Resolve Target User
  let resolvedUser: { id: string; email: string; displayName: string } | null = null;
  const isEmailInput = targetInput.includes('@');

  // Query Auth admin users
  try {
    const authAdminHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    };
    const userRes = await fetchFn(
      `${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`,
      { headers: authAdminHeaders }
    );
    if (userRes.ok) {
      const data = (await userRes.json()) as { users?: RawAuthUser[] };
      if (Array.isArray(data.users)) {
        const found = data.users.find((u) => {
          if (isEmailInput) {
            return (u.email || '').toLowerCase() === targetInput.toLowerCase();
          }
          return u.id === targetInput;
        });
        if (found) {
          resolvedUser = {
            id: found.id,
            email: found.email || '',
            displayName: extractUserDisplayName(found, found.email),
          };
        }
      }
    }
  } catch {
    // Continue
  }

  // If not found in Auth Admin list, check user_wallets directly
  if (!resolvedUser) {
    try {
      const queryParam = isEmailInput ? '' : `user_id=eq.${encodeURIComponent(targetInput)}`;
      if (queryParam) {
        const checkWalletRes = await fetchFn(
          `${config.supabaseUrl}/rest/v1/user_wallets?${queryParam}&limit=1`,
          { headers }
        );
        if (checkWalletRes.ok) {
          const rows = (await checkWalletRes.json()) as Array<{ user_id: string }>;
          if (Array.isArray(rows) && rows[0]?.user_id) {
            resolvedUser = {
              id: rows[0].user_id,
              email: isEmailInput ? targetInput : '',
              displayName: isEmailInput ? targetInput.split('@')[0] : `User ${rows[0].user_id.slice(0, 8)}`,
            };
          }
        }
      }
    } catch {
      // Continue
    }
  }

  if (!resolvedUser) {
    return {
      success: false,
      status: 404,
      error: `ไม่พบบัญชีผู้ใช้ "${targetInput}" ในระบบ กรุณาตรวจสอบอีเมลหรือ User ID อีกครั้ง`,
    };
  }

  // 2. Fetch or Init current wallet
  const currentWallet = await ensureWalletViaRest(resolvedUser.id, config, fetchFn);

  const nextTrial = creditType === 'trial' ? currentWallet.trialCredits + amount : currentWallet.trialCredits;
  const nextPurchased = creditType === 'purchased' ? currentWallet.purchasedCredits + amount : currentWallet.purchasedCredits;

  // 3. Update wallet
  await patchUserWalletViaRest(
    resolvedUser.id,
    { trial_credits: nextTrial, purchased_credits: nextPurchased },
    config,
    fetchFn
  );

  // 4. Insert transaction audit entry
  const descriptionPrefix = `[Admin Manual Topup] ${reason}`;
  const auditDescription = adminEmail ? `${descriptionPrefix} (โดย ${adminEmail})` : descriptionPrefix;

  await insertCreditTransactionViaRest(
    {
      user_id: resolvedUser.id,
      tx_type: creditType === 'trial' ? 'grant_trial' : 'topup',
      amount,
      description: auditDescription,
      trans_ref: null,
      metadata: {
        admin_email: adminEmail || null,
        credit_type: creditType,
        granted_at: new Date().toISOString(),
      },
    },
    config,
    fetchFn
  );

  const updatedWallet: WalletBalanceSummary = {
    trialCredits: nextTrial,
    purchasedCredits: nextPurchased,
    balance: nextTrial + nextPurchased,
  };

  const typeLabel = creditType === 'trial' ? 'เครดิตทดลอง (Trial)' : 'เครดิตเติมเงิน (Purchased)';
  const message = `เติม ${typeLabel} จำนวน +${amount.toLocaleString()} เหรียญ ให้กับ ${resolvedUser.email || resolvedUser.displayName} สำเร็จ (ยอดคงเหลือใหม่: ${updatedWallet.balance.toLocaleString()} เหรียญ)`;

  return {
    success: true,
    status: 200,
    message,
    targetUser: resolvedUser,
    wallet: updatedWallet,
  };
}
