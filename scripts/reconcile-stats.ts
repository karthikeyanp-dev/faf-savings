/**
 * Recompute stats/current from the transaction ledger + config/app.
 *
 * stats/current is a denormalized running total that only the app's own
 * writes maintain, so it drifts whenever transactions are added, edited or
 * deleted outside the app — and it never included the config-level
 * `openingBalances` / `openingInterest`, which SetOpeningBalanceDialog writes
 * to config/app only. The UI now derives its figures from the ledger, but
 * stats.poolBalance still gates createTransaction's insufficient-balance
 * check and the firestore.rules delta validation, so it is worth truing up.
 *
 * The computed figures treat `config/app` as the source of truth for
 * carried-forward balances, so writing them when config is missing or stale
 * would drop those amounts from `poolBalance` and block every subsequent
 * withdrawal/borrow. The preflight below refuses to write in that case.
 *
 *   npx tsx scripts/reconcile-stats.ts                 # dry run, prints the diff
 *   npx tsx scripts/reconcile-stats.ts --apply         # writes, after confirmation
 *   npx tsx scripts/reconcile-stats.ts --apply --yes   # writes without prompting
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import {
  computePoolTotals,
  getTotalOpeningBalance,
  type LightweightTransaction,
} from '../src/utils/financialYear';

type LedgerRow = LightweightTransaction & { memberId?: string; notes?: string };

/**
 * Reasons the computed totals cannot be trusted as a replacement for the
 * stored doc. Each one means config/app and the ledger disagree about who
 * owns a carried-forward figure, so applying would silently lose money.
 */
function findBlockers(
  configExists: boolean,
  config: Record<string, any>,
  transactions: LedgerRow[],
): string[] {
  const blockers: string[] = [];
  const active = transactions.filter((t) => t.status === 'active');

  if (!configExists) {
    blockers.push(
      'config/app does not exist. computePoolTotals() would drop every carried-forward balance from poolBalance.',
    );
    return blockers;
  }

  const openingBalances: Record<string, number> = config.openingBalances ?? {};

  // Active opening_balance rows are excluded from the computed totals on the
  // assumption config mirrors them. Where it does not, applying deletes the
  // difference from poolBalance.
  const obByMember = new Map<string, number>();
  for (const t of active) {
    if (t.type !== 'opening_balance') continue;
    const key = t.memberId ?? '(no member)';
    obByMember.set(key, (obByMember.get(key) ?? 0) + t.amount);
  }
  for (const [memberId, amount] of obByMember) {
    const configured = openingBalances[memberId];
    if (typeof configured !== 'number' || Math.abs(configured - amount) > 0.005) {
      blockers.push(
        `Active opening_balance transactions for member ${memberId} total ${amount}, but config.openingBalances has ${configured ?? '(missing)'}. These rows are ignored by the computed totals.`,
      );
    }
  }

  // The mirror of the above for interest: carried-forward interest has no
  // dedicated type, so a ledger row plus a non-zero config value is counted
  // twice. See the computePoolTotals() docblock.
  const openingInterest = config.openingInterest ?? 0;
  const openingInterestRows = active.filter(
    (t) => t.type === 'interest' && /^Opening interest for FY/.test(t.notes ?? ''),
  );
  if (openingInterest !== 0 && openingInterestRows.length > 0) {
    const total = openingInterestRows.reduce((sum, t) => sum + t.amount, 0);
    blockers.push(
      `config.openingInterest is ${openingInterest} and ${openingInterestRows.length} active opening-interest transaction(s) totalling ${total} also exist. The computed interest double-counts them; void the rows or clear the config value first.`,
    );
  }

  return blockers;
}

function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      '\n❌ Not a TTY and --yes was not passed. Re-run with --yes to write non-interactively.',
    );
    return Promise.resolve(false);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) =>
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === 'yes');
    }),
  );
}

const serviceAccountPath = resolve(process.cwd(), 'service-account-key.json');
if (existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount as any),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
  });
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore();
const apply = process.argv.includes('--apply');
const assumeYes = process.argv.includes('--yes');

async function reconcile() {
  const [statsSnap, configSnap, txSnap] = await Promise.all([
    db.doc('stats/current').get(),
    db.doc('config/app').get(),
    db.collection('transactions').get(),
  ]);

  if (!statsSnap.exists) {
    console.error('❌ stats/current does not exist. Run the seed script first.');
    process.exit(1);
  }

  const stored = statsSnap.data() ?? {};
  const config = configSnap.data() ?? {};
  const transactions = txSnap.docs.map((d) => d.data() as LedgerRow);
  const blockers = findBlockers(configSnap.exists, config, transactions);

  const openingBalanceTotal = getTotalOpeningBalance(config.openingBalances);
  const openingInterest = config.openingInterest ?? 0;
  const totals = computePoolTotals(transactions, openingBalanceTotal, openingInterest);

  // Mirrors what the UI derives, so the two can never disagree. Note that
  // poolBalance / totalDeposit / totalInterest include the config
  // carry-forward figures — a reader must not add config on top again.
  const computed = {
    poolBalance: totals.balance,
    totalDeposit: totals.deposited,
    totalInterest: totals.interest,
    totalRepayment: totals.repaid,
    totalWithdrawal: totals.withdrawn,
    totalBorrow: totals.borrowed,
    totalPayout: totals.paidOut,
  };

  console.log(`Active transactions: ${transactions.filter((t) => t.status === 'active').length} of ${transactions.length}`);
  console.log(`config openingBalances total: ${openingBalanceTotal}, openingInterest: ${openingInterest}\n`);
  console.log('field'.padEnd(16), 'stored'.padStart(14), 'computed'.padStart(14), 'drift'.padStart(14));
  let drifted = false;
  for (const [field, value] of Object.entries(computed)) {
    const before = (stored as any)[field];
    const drift = value - (typeof before === 'number' ? before : 0);
    if (Math.abs(drift) > 0.005) drifted = true;
    console.log(
      field.padEnd(16),
      String(before ?? '—').padStart(14),
      value.toFixed(2).padStart(14),
      drift.toFixed(2).padStart(14),
    );
  }

  if (blockers.length > 0) {
    console.error('\n❌ Refusing to write — config/app and the ledger disagree:');
    for (const blocker of blockers) console.error(`   • ${blocker}`);
    console.error(
      '\nFix the underlying data first; applying now would write a poolBalance that blocks withdrawals and borrows.',
    );
    process.exit(1);
  }

  if (!drifted) {
    console.log('\n✅ stats/current already matches the ledger. Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('\nDry run — re-run with --apply to write the computed values.');
    return;
  }

  if (!assumeYes) {
    const ok = await confirm(
      '\nWrite these computed values over stats/current? Type "yes" to confirm: ',
    );
    if (!ok) {
      console.log('Aborted — nothing written.');
      return;
    }
  }

  await db.doc('stats/current').set(
    {
      ...computed,
      // Legacy field superseded by totalRepayment; dropped from the mirror.
      totalReturn: null,
      updatedAt: new Date(),
      reconciledAt: new Date(),
    },
    { merge: true },
  );
  console.log('\n✅ stats/current reconciled.');
}

reconcile().catch((error) => {
  console.error('❌ Reconcile failed:', error);
  process.exit(1);
});
