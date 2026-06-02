# FaF Savings Performance Improvements (Validated)

## Goals and success metrics

- Initial JS payload: 1,171 KB single bundle, down to roughly 200 KB on first route.
- Firestore reads per page open: from "entire `transactions` collection" to bounded (current FY or paginated).
- Activity / Members pages remain responsive at 500+ transactions and 50+ members.
- No regressions in current functionality (auth flow, transaction CRUD, notifications, PWA).

## Decisions confirmed with user

- Keep the client-side `runTransaction` path; delete the unused Cloud Functions code.
- Compress QR client-side and keep it as base64 in the config doc (no Firebase Storage migration).

## Validation notes (from codebase audit)

- `src/lib/firestore.ts` exports (`getTransactionsByFY`, `getTransactionsByMember`, etc.) are defined but **imported by zero files** — confirmed via grep.
- `Float` and `Pulse` components in `PageTransition.tsx` are exported but **never imported anywhere** — dead code.
- All 4 pages do `getDocs(collection(db, 'transactions'))` — reads the entire collection on every page load.
- `firebase.json` has no `functions` block — the `functions/` directory is completely unused.
- No `React.lazy`, no `manualChunks`, no `React.memo` anywhere in the codebase.
- The no-op spread `activeTransactions.map(t => ({ ...t, memberId: t.memberId }))` appears 6 times across 3 files.
- `QueryProvider` has no `gcTime`, no `retry` config; default retry is 3 (slow offline feedback).
- The 3 composite indexes in `firestore.indexes.json` already cover all Task 1 query patterns.
- No `stats/current` Firestore doc exists — there is no write-side logic to maintain one. All-time stats must be computed client-side from `getAllActiveTransactions()`.

---

## Task 1: Use bounded Firestore queries everywhere

The pre-built queries in [src/lib/firestore.ts](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/lib/firestore.ts) are never imported. Switch every page over.

- [src/pages/Dashboard.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Dashboard.tsx) (lines 307-315): use `getTransactionsByFY(currentFY)` for FY-scoped stats. For all-time totals (pool balance, total receivables, total deposits), use `getAllActiveTransactions()` once — do **not** introduce a `stats/current` doc since no write-side logic exists to maintain it.
- [src/pages/Members.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Members.tsx) (lines 137-143): use `getAllActiveTransactions()` for member net calculations (needs all-time data). Use `getTransactionsByFY(currentFY)` for FY-specific stats.
- [src/pages/MemberDetail.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/MemberDetail.tsx) (lines 125-133): use `getTransactionsByMember(member.id)` for the transaction history; this also moves the date sort to the server (drop the client `.sort()` at lines 207-209). Also use `getAllActiveTransactions()` for net balance calculation.
- [src/pages/Activity.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Activity.tsx) (lines 171-177): use `getAllTransactions()` with `limit(50)` plus a `startAfter` cursor for "Load more". Activity page needs all transactions (cross-FY filtering), so the paginated approach is the right fit.

Update React Query keys to include the filter, e.g. `['transactions', 'fy', currentFY]`, `['transactions', 'member', memberId]`, `['transactions', 'paginated']`, so caches don't collide.

Add a new helper if needed for opening-balance transactions, since they may be filtered out of the FY query.

## Task 2: Route-level code splitting

- [src/App.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/App.tsx): convert all page imports to `React.lazy(() => import(...).then(m => ({ default: m.PageName })))`. Wrap `<Routes>` in `<Suspense fallback={<Spinner />}>`.
- Lazy-import the maintainer-only dialogs from [src/components/transactions/](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/components/transactions) (AddTransactionDialog, EditTransactionDialog, VoidTransactionDialog, AddMemberDialog, EditMemberDialog, SetOpeningBalanceDialog) so they only load when opened. Note: Activity.tsx already conditionally renders dialogs (`{editingTx && ...}`), so the lazy-load win is from the import itself, not the rendering.
- [vite.config.ts](file:///d:/WorkSpace/Personal/Production/FaF_Savings/vite.config.ts): add `build.rollupOptions.output.manualChunks` to split `firebase`, `framer-motion`, `@tanstack/react-query`, `react-router-dom` into separate long-cache vendor chunks. Note: `framer-motion` is used on every page, so it will still load on first route — the win is making it a long-cache chunk for repeat visits.

## Task 3: Compress QR before storing

In [src/pages/Settings.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Settings.tsx) `handleQRUpload` (lines 256-283):

- Load the file into an `Image`, draw to an offscreen `<canvas>` at max 300x300, export via `canvas.toDataURL('image/jpeg', 0.8)`.
- Validate the resulting base64 is under 60 KB before writing.
- Keep the existing `updateDoc` write to `config/app`.

This drops the `config` doc from potentially over 1 MB to roughly 30-50 KB without introducing Firebase Storage.

## Task 4: Build per-page derived data once

Replace repeated `members.find()` and 4-pass `.filter().reduce()` loops with a single pass plus lookup maps.

Files: [src/pages/Dashboard.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Dashboard.tsx), [src/pages/Members.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Members.tsx), [src/pages/MemberDetail.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/MemberDetail.tsx), [src/pages/Activity.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Activity.tsx).

For each page:

```tsx
const memberById = useMemo(
  () => new Map(members.map(m => [m.id, m])),
  [members]
);

const memberStats = useMemo(() => {
  const map = new Map<string, {dep:number; wd:number; ret:number; int:number}>();
  for (const t of fyTransactions) {
    const s = map.get(t.memberId) ?? {dep:0, wd:0, ret:0, int:0};
    if (t.type === 'deposit') s.dep += t.amount;
    else if (t.type === 'withdrawal') s.wd += t.amount;
    else if (t.type === 'return') s.ret += t.amount;
    else if (t.type === 'interest') s.int += t.amount;
    map.set(t.memberId, s);
  }
  return map;
}, [fyTransactions]);
```

Also remove every `activeTransactions.map((t) => ({ ...t, memberId: t.memberId }))` no-op spread (Dashboard lines 343, 476, 533; Members lines 244, 290; MemberDetail line 176).

**Important:** Dashboard and Members currently compute member stats **inside the render body** (not in `useMemo`), so they recompute on every render including dialog state changes. Wrap all derived computations in `useMemo`.

## Task 5: Memoize leaf components

Wrap in `React.memo` so unrelated parent state changes (search input, dialog toggles) do not re-render every row:

- `MemberCard` in [src/pages/Dashboard.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Dashboard.tsx#L159-L284) and [src/pages/Members.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Members.tsx#L27-L118).
- `TransactionCard` in [src/pages/Activity.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Activity.tsx#L57-L130) and `TransactionRow` in [src/pages/MemberDetail.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/MemberDetail.tsx#L53-L109).
- `SummaryCard`, `FYStatsCard` in [src/pages/Dashboard.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Dashboard.tsx).
- `MemberCard` and `SettingsSection` in [src/pages/Settings.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Settings.tsx).

**Critical:** `React.memo` alone is not enough. Must pair with `useCallback` for all `onClick`/`onEdit`/`onToggle`/`onVoid` handlers passed to these components. Current inline handlers in `.map()` (e.g., `() => navigate(...)`, `() => setEditingTx(tx)`) create new references every render, defeating memo. Refactor to stable callbacks:

```tsx
const handleMemberClick = useCallback((id: string) => navigate(`/members/${id}`), [navigate]);
const handleEditTx = useCallback((tx: TransactionDoc) => setEditingTx(tx), []);
```

For Settings `MemberCard` `onToggle` which uses `window.confirm` inline (lines 556-560), pass the member ID back via callback and handle confirm in the parent.

## Task 6: Trim animation overhead

[src/components/animations/PageTransition.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/components/animations/PageTransition.tsx):

- **Remove `Float` and `Pulse` immediately** — confirmed dead code (exported but never imported anywhere in the codebase).
- Limit `StaggerContainer`/`StaggerItem` to the first 10 children, then render the rest without stagger. With 30+ rows the cascade noticeably delays first paint. Implementation: accept a `maxStagger` prop (default 10), render children beyond that index as plain `<div>` without `StaggerItem`.
- Reduce animated `motion.div` wrappers in [src/pages/Settings.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Settings.tsx) and `MemberDetail` KPI cards (6 individual `motion.div` wrappers at lines 247, 277, 297, 314, 331, 350, 372); static markup is fine after the initial route transition.
- Replace the heavy `motion` import with the lazy `m` component (`import { m as motion } from 'framer-motion'`) in the heaviest pages (Dashboard, Activity) and wrap the app in `<LazyMotion features={domAnimation}>` in `App.tsx` to drop roughly 30 KB. Keep `motion` import in smaller files where the tree-shaking benefit is negligible.
- `TapScale` is used heavily in Settings — it is fine to keep as-is since it only uses `whileTap`/`whileHover` (no infinite animations).

## Task 7: Tighten React Query usage

- [src/providers/QueryProvider.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/providers/QueryProvider.tsx): add `gcTime: 1000 * 60 * 30` so cached pages survive navigation, and `retry: 1` to fail fast on offline (current default is 3 retries = slow failure feedback).
- **Defer `select` option** until after Task 1 is complete. Once each page has its own scoped query key (`['transactions', 'fy', ...]`, `['transactions', 'member', ...]`), the need for `select` is reduced since the server already returns filtered data.
- **Defer prefetch-on-hover** for MemberDetail — low priority for this app's scale (likely < 50 members). Revisit if member count grows significantly.

## Task 8: Optimize Activity page filters

In [src/pages/Activity.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/pages/Activity.tsx#L197-L213):

- Lowercase `searchQuery` once outside the predicate (currently recomputed per-transaction inside the filter).
- Build a `memberById` Map (as in Task 4) and use it for member-name lookups instead of `members.find()` (O(members) per transaction).
- Single-pass filter fusion is **optional** — at this app's scale (likely < 1000 transactions visible at once), 4 chained `.filter()` calls are not a bottleneck. The `memberById` map is the meaningful optimization here.
- Do **not** pre-attach member names via React Query `select` — this conflicts with Task 1's per-context query keys. Use the `memberById` map lookup instead.

## Task 9: Delete dead Cloud Functions code

Confirmed: [firebase.json](file:///d:/WorkSpace/Personal/Production/FaF_Savings/firebase.json) has no `functions` block, so the code is completely unused.

- Delete the entire `functions/` directory: `functions/src/transactions.ts`, `functions/src/index.ts`, `functions/src/types.ts`, `functions/package.json`, `functions/tsconfig.json`.
- Remove the `functions` directory entry from any tooling config if referenced.
- Keep [src/lib/transactions.ts](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/lib/transactions.ts) as the single source of truth. Firestore rules in [firestore.rules](file:///d:/WorkSpace/Personal/Production/FaF_Savings/firestore.rules) already enforce maintainer + balance invariants.

## Task 10: Cleanup and indexes

- Remove unused exports from [src/lib/firestore.ts](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/lib/firestore.ts) after Task 1 (e.g., `getAllActiveTransactions` if no longer needed by any page).
- Verify [firestore.indexes.json](file:///d:/WorkSpace/Personal/Production/FaF_Savings/firestore.indexes.json) covers every new query path. The current 3 composite indexes already match the Task 1 queries — test with Firestore emulator to confirm.
- **Deferred (low priority):** PNG icon compression in `public/` and WebP variants. This is cosmetic and does not affect runtime performance since these are PWA install icons, not hot-path assets.
- **Deferred (requires caution):** Caching user role in `localStorage` in [src/providers/AuthProvider.tsx](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/providers/AuthProvider.tsx). The SW notification bridge logic (lines 37-55) depends on the fresh role from Firestore. A stale cached role could cause notification delivery issues. If implemented: read from `localStorage` immediately, set context, then revalidate with Firestore in the background — but do not skip the Firestore call. Only apply this optimization after the notification bridge is stable.

## ~~Task 11: Virtualize long lists~~ — DEFERRED

**Not needed at this stage.** For a friends-and-family savings pool, the app is unlikely to show 100+ visible items on a single page view. The `limit(50)` pagination from Task 1 plus cursor-based loading is sufficient. Adding `@tanstack/react-virtual` introduces complexity (fixed-height containers, scroll management, dynamic row heights with cards) that is not justified. Revisit only if Activity page actually shows 100+ items after Task 1 pagination is in place and users report scroll jank.

## Task 11: Final verification

- `npm run build` and confirm the new chunk layout: a small `index-*.js`, per-route chunks, and named vendor chunks.
- Manual smoke test in dev mode: login, dashboard load, member detail, activity filtering, transaction add/edit/void, QR upload, dark mode, notifications toggle, PWA offline.
- `npm run test` for [src/utils/financialYear.test.ts](file:///d:/WorkSpace/Personal/Production/FaF_Savings/src/utils/financialYear.test.ts) and any new utility tests added during the refactor.
- Run Lighthouse on the deployed preview to capture before/after numbers for TTI, LCP, JS payload, and Firestore reads.
- Test Firestore queries against the emulator to verify composite indexes work correctly with the new bounded query patterns from Task 1.

---

## Rollout order

1. **Tasks 1, 4, 9** — immediate Firestore cost and runtime wins with low risk.
2. **Tasks 2, 3** — bundle and config-doc size wins, visible on first paint.
3. **Tasks 5, 6, 7, 8** — render-time polish that compounds with previous tasks.
4. **Task 10** — cleanup (indexes already verified in step 1).
5. **Task 11 (verification)** — sign-off and benchmarks.

Each task touches a bounded set of files, so they can be shipped as separate commits or PRs and verified independently.
