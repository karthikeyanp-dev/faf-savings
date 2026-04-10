# FaF Savings Pool — Implementation Plan

## Architecture Overview

```
Frontend (React + Vite + TS + shadcn/ui)
  └── Firebase Auth (Email/Password)
  └── Firestore (data)
  └── Firebase Storage (QR image)
  └── Cloud Functions (callable: createTransaction, updateTransaction, voidTransaction)

Backend (Firebase Cloud Functions — TypeScript)
  └── Enforces: role=maintainer, pool balance never negative, atomic updates
  └── Maintains stats/current aggregate atomically
```

Key design decisions based on your answers:
- **Members are logical only** — no auth account per member. Only maintainer and viewers have Firebase Auth accounts.
- **Email+Password** auth, invite-only (admin seeds initial users).
- **Excel import** uses a special `opening_balance` transaction type.
- **Cloud Functions (callable)** for all transaction writes — enforces non-negative pool balance atomically.

---

## Phase 1: Project Setup & Configuration

### 1.1 Initialize Vite + React + TypeScript
```bash
npm create vite@latest . -- --template react-ts
npm install
```

### 1.2 Install Dependencies
```bash
# Core
npm install firebase react-router-dom @tanstack/react-query @tanstack/react-table
npm install react-hook-form @hookform/resolvers zod
npm install date-fns class-variance-authority clsx tailwind-merge lucide-react

# UI: shadcn/ui (init)
npx shadcn@latest init
npx shadcn@latest add button card table dialog form input label select tabs dropdown-menu badge popover toast avatar switch separator skeleton alert-dialog sonner

# Dev
npm install -D tailwindcss @tailwindcss/vite
npm install -D @types/node
npm install -D prettier eslint
```

### 1.3 Project Structure
```
faf-savings/
├── public/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── transactions/
│   │   │   ├── TransactionTable.tsx
│   │   │   ├── TransactionFilters.tsx
│   │   │   ├── AddTransactionDialog.tsx
│   │   │   ├── EditTransactionDialog.tsx
│   │   │   └── VoidTransactionDialog.tsx
│   │   ├── members/
│   │   │   ├── MemberTable.tsx
│   │   │   └── MemberDetail.tsx
│   │   ├── dashboard/
│   │   │   ├── StatCards.tsx
│   │   │   └── MemberSummaryTable.tsx
│   │   └── settings/
│   │       ├── PaymentDetailsForm.tsx
│   │       ├── MemberManagement.tsx
│   │       └── MaintainerHandover.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Members.tsx
│   │   ├── Activity.tsx
│   │   ├── Settings.tsx
│   │   └── Login.tsx
│   ├── lib/
│   │   ├── firebase.ts          # Firebase init
│   │   ├── firestore.ts         # Typed collection refs, queries
│   │   ├── auth.ts              # Auth helpers
│   │   └── utils.ts             # cn(), formatters
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTransactions.ts
│   │   ├── useMembers.ts
│   │   └── useConfig.ts
│   ├── types/
│   │   └── index.ts             # All Firestore document types
│   ├── schemas/
│   │   └── index.ts             # Zod validation schemas
│   ├── utils/
│   │   └── financialYear.ts     # FY calculation, balance helpers
│   ├── providers/
│   │   ├── AuthProvider.tsx
│   │   └── QueryProvider.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── functions/                    # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts
│   │   ├── transactions.ts      # Callable functions
│   │   ├── validation.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── seed.ts                  # Seed initial data
│   └── importExcel.ts           # Excel import script
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── .env.example
├── .prettierrc
├── .eslintrc.cjs
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── package.json
└── README.md
```

---

## Phase 2: Types, Schemas, Utilities

### 2.1 `src/types/index.ts` — Firestore Document Interfaces

```typescript
export type Role = 'maintainer' | 'viewer';
export type TransactionType = 'deposit' | 'withdrawal' | 'return' | 'opening_balance';
export type TransactionStatus = 'active' | 'void';

export interface UserDoc {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberDoc {
  id: string;
  name: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TransactionDoc {
  id: string;
  type: TransactionType;
  memberId: string;
  amount: number;
  date: Timestamp;
  fy: string;         // "2025-2026"
  savingsMonth?: string; // "YYYY-MM"
  notes?: string;
  status: TransactionStatus;
  voidReason?: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AppConfig {
  fyStartMonth: number; // 4 (April)
  currentMaintainerUid: string;
  upiId?: string;
  bankDetails?: string;
  qrUrl?: string;
  updatedAt: Timestamp;
  updatedByUid: string;
}

export interface StatsCurrent {
  poolBalance: number;
  totalDeposit: number;
  totalReturn: number;
  totalWithdrawal: number;
  updatedAt: Timestamp;
}

export interface MaintainerHistoryDoc {
  id: string;
  from: Timestamp;
  to?: Timestamp;
  maintainerUid: string;
  handoverByUid: string;
  createdAt: Timestamp;
}
```

### 2.2 `src/schemas/index.ts` — Zod Schemas

```typescript
export const transactionSchema = z.object({
  type: z.enum(['deposit', 'withdrawal', 'return']),
  memberId: z.string().min(1, 'Member is required'),
  amount: z.coerce.number().positive('Amount must be > 0'),
  date: z.date(),
  savingsMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().or(z.literal('')),
  notes: z.string().optional(),
});

export const voidSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});
```

### 2.3 `src/utils/financialYear.ts`

```typescript
// FY: April → March
// Apr-Dec 2025 => "2025-2026"
// Jan-Mar 2026 => "2025-2026"
export function getFY(date: Date, fyStartMonth = 4): string {
  const month = date.getMonth() + 1; // 1-indexed
  const year = date.getFullYear();
  if (month >= fyStartMonth) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function parseFY(fy: string): { start: Date; end: Date } {
  const [startYear] = fy.split('-').map(Number);
  return {
    start: new Date(startYear, 3, 1),  // April 1
    end: new Date(startYear + 1, 2, 31), // March 31
  };
}

export function calculatePoolBalance(transactions: TransactionDoc[]): number {
  return transactions
    .filter(t => t.status === 'active')
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return' || t.type === 'opening_balance') {
        return sum + t.amount;
      }
      if (t.type === 'withdrawal') {
        return sum - t.amount;
      }
      return sum;
    }, 0);
}

export function calculateMemberNet(transactions: TransactionDoc[], memberId: string): number {
  return transactions
    .filter(t => t.status === 'active' && t.memberId === memberId)
    .reduce((sum, t) => {
      if (t.type === 'deposit' || t.type === 'return' || t.type === 'opening_balance') return sum + t.amount;
      if (t.type === 'withdrawal') return sum - t.amount;
      return sum;
    }, 0);
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
```

**Unit tests**: `src/utils/financialYear.test.ts` — test FY boundaries, balance calculations.

---

## Phase 3: Firebase Setup

### 3.1 `src/lib/firebase.ts`

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
```

### 3.2 `src/lib/firestore.ts` — Typed Collection Refs

```typescript
import { collection, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import type { TransactionDoc, MemberDoc, UserDoc, AppConfig, StatsCurrent } from '../types';

export const usersRef = collection(db, 'users');
export const membersRef = collection(db, 'members');
export const transactionsRef = collection(db, 'transactions');
export const configRef = doc(db, 'config', 'app');
export const statsRef = doc(db, 'stats', 'current');
export const maintainerHistoryRef = collection(db, 'maintainerHistory');

// Typed query helpers
export function getTransactionsByFY(fy: string) {
  return query(transactionsRef, where('fy', '==', fy), where('status', '==', 'active'), orderBy('date', 'desc'));
}
```

### 3.3 `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper: check if user is maintainer
    function isMaintainer() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'maintainer';
    }
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Users: read own, maintainer can read all
    match /users/{uid} {
      allow read: if isAuthenticated();
      allow write: if false; // Only via seed/admin
    }
    
    // Members: anyone authenticated can read, only maintainer can write
    match /members/{memberId} {
      allow read: if isAuthenticated();
      allow write: if isMaintainer();
    }
    
    // Transactions: read for all authenticated, write ONLY via Cloud Functions
    match /transactions/{txId} {
      allow read: if isAuthenticated();
      allow create, update, delete: if false; // Locked — only Cloud Functions write
    }
    
    // Stats: read for all, write ONLY via Cloud Functions
    match /stats/{doc} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
    
    // Config: read for all, only maintainer can write
    match /config/{doc} {
      allow read: if isAuthenticated();
      allow write: if isMaintainer();
    }
    
    // Maintainer history: read for all, write only maintainer
    match /maintainerHistory/{id} {
      allow read: if isAuthenticated();
      allow write: if isMaintainer();
    }
  }
}
```

### 3.4 `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "fy", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "memberId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## Phase 4: Cloud Functions (Server-Side Enforcement)

### 4.1 `functions/src/types.ts` — Shared types for callable validation

```typescript
export interface CreateTransactionInput {
  type: 'deposit' | 'withdrawal' | 'return' | 'opening_balance';
  memberId: string;
  amount: number;
  date: string; // ISO date string
  savingsMonth?: string;
  notes?: string;
}

export interface UpdateTransactionInput {
  txId: string;
  type?: string;
  memberId?: string;
  amount?: number;
  date?: string;
  savingsMonth?: string;
  notes?: string;
}

export interface VoidTransactionInput {
  txId: string;
  reason: string;
}
```

### 4.2 `functions/src/transactions.ts` — Callable Functions

```typescript
import * as functions from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Helper: compute FY
function getFY(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

// Helper: verify maintainer
async function verifyMaintainer(uid: string): Promise<void> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'maintainer') {
    throw new functions.https.HttpsError('permission-denied', 'Only maintainer can perform this action');
  }
}

// CREATE TRANSACTION
export const createTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const data = request.data as CreateTransactionInput;
  // Validate input
  if (!data.memberId || !data.amount || data.amount <= 0 || !data.date) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid transaction data');
  }
  if (data.type === 'deposit' && !data.savingsMonth) {
    throw new functions.https.HttpsError('invalid-argument', 'savingsMonth required for deposits');
  }

  const fy = getFY(data.date);

  return db.runTransaction(async (tx) => {
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    if (!statsDoc.exists) throw new Error('Stats document not found');
    const stats = statsDoc.data()!;

    // Calculate new balance
    let balanceDelta = 0;
    if (data.type === 'deposit' || data.type === 'return' || data.type === 'opening_balance') {
      balanceDelta = data.amount;
    } else if (data.type === 'withdrawal') {
      balanceDelta = -data.amount;
    }

    const newBalance = stats.poolBalance + balanceDelta;
    if (newBalance < 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient pool balance. Available: ₹${stats.poolBalance}, Requested: ₹${data.amount}`
      );
    }

    // Create transaction
    const txRef = db.collection('transactions').doc();
    tx.set(txRef, {
      type: data.type,
      memberId: data.memberId,
      amount: data.amount,
      date: admin.firestore.Timestamp.fromDate(new Date(data.date)),
      fy,
      savingsMonth: data.savingsMonth || null,
      notes: data.notes || null,
      status: 'active',
      createdByUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update stats
    const updates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.type === 'deposit') updates.totalDeposit = (stats.totalDeposit || 0) + data.amount;
    if (data.type === 'return') updates.totalReturn = (stats.totalReturn || 0) + data.amount;
    if (data.type === 'opening_balance') updates.totalDeposit = (stats.totalDeposit || 0) + data.amount;
    if (data.type === 'withdrawal') updates.totalWithdrawal = (stats.totalWithdrawal || 0) + data.amount;

    tx.update(statsRef, updates);

    return { txId: txRef.id, newBalance };
  });
});

// UPDATE TRANSACTION
export const updateTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const { txId, ...updates } = request.data as UpdateTransactionInput;

  return db.runTransaction(async (tx) => {
    const txRef = db.collection('transactions').doc(txId);
    const txDoc = await tx.get(txRef);
    if (!txDoc.exists) throw new functions.https.HttpsError('not-found', 'Transaction not found');
    if (txDoc.data()?.status === 'void') {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot edit a voided transaction');
    }

    const oldTx = txDoc.data()!;
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    const stats = statsDoc.data()!;

    // Revert old transaction from stats
    let oldDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) oldDelta = oldTx.amount;
    if (oldTx.type === 'withdrawal') oldDelta = -oldTx.amount;

    // Apply new transaction to stats
    const newType = updates.type || oldTx.type;
    const newAmount = updates.amount ?? oldTx.amount;
    let newDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(newType)) newDelta = newAmount;
    if (newType === 'withdrawal') newDelta = -newAmount;

    const balanceChange = newDelta - oldDelta;
    const newBalance = stats.poolBalance + balanceChange;
    if (newBalance < 0) {
      throw new functions.https.HttpsError('failed-precondition', `Insufficient pool balance. Available: ₹${stats.poolBalance}`);
    }

    // Update transaction
    const updateData: Record<string, any> = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (updates.date) {
      updateData.fy = getFY(updates.date);
      updateData.date = admin.firestore.Timestamp.fromDate(new Date(updates.date));
    }

    tx.update(txRef, updateData);

    // Update stats
    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (oldTx.type !== newType) {
      // Handle type change: subtract from old total, add to new total
      if (oldTx.type === 'deposit') statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
      if (oldTx.type === 'return') statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
      if (oldTx.type === 'withdrawal') statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) - oldTx.amount;
      if (newType === 'deposit') statsUpdates.totalDeposit = (statsUpdates.totalDeposit ?? stats.totalDeposit || 0) + newAmount;
      if (newType === 'return') statsUpdates.totalReturn = (statsUpdates.totalReturn ?? stats.totalReturn || 0) + newAmount;
      if (newType === 'withdrawal') statsUpdates.totalWithdrawal = (statsUpdates.totalWithdrawal ?? stats.totalWithdrawal || 0) + newAmount;
    } else if (oldTx.amount !== newAmount) {
      if (newType === 'deposit') statsUpdates.totalDeposit = (stats.totalDeposit || 0) + (newAmount - oldTx.amount);
      if (newType === 'return') statsUpdates.totalReturn = (stats.totalReturn || 0) + (newAmount - oldTx.amount);
      if (newType === 'withdrawal') statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) + (newAmount - oldTx.amount);
    }

    tx.update(statsRef, statsUpdates);
    return { newBalance };
  });
});

// VOID TRANSACTION
export const voidTransaction = functions.onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  await verifyMaintainer(uid);

  const { txId, reason } = request.data as VoidTransactionInput;
  if (!reason) throw new functions.https.HttpsError('invalid-argument', 'Void reason required');

  return db.runTransaction(async (tx) => {
    const txRef = db.collection('transactions').doc(txId);
    const txDoc = await tx.get(txRef);
    if (!txDoc.exists) throw new functions.https.HttpsError('not-found', 'Transaction not found');
    if (txDoc.data()?.status === 'void') {
      throw new functions.https.HttpsError('failed-precondition', 'Transaction already voided');
    }

    const oldTx = txDoc.data()!;
    const statsRef = db.collection('stats').doc('current');
    const statsDoc = await tx.get(statsRef);
    const stats = statsDoc.data()!;

    // Reverse the transaction from stats
    let reversalDelta = 0;
    if (['deposit', 'return', 'opening_balance'].includes(oldTx.type)) reversalDelta = -oldTx.amount;
    if (oldTx.type === 'withdrawal') reversalDelta = oldTx.amount;

    const newBalance = stats.poolBalance + reversalDelta;
    if (newBalance < 0) {
      throw new functions.https.HttpsError('failed-precondition', 'Voiding this transaction would make pool negative (unexpected — contact developer)');
    }

    // Void transaction
    tx.update(txRef, {
      status: 'void',
      voidReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update stats
    const statsUpdates: Record<string, any> = {
      poolBalance: newBalance,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (oldTx.type === 'deposit') statsUpdates.totalDeposit = (stats.totalDeposit || 0) - oldTx.amount;
    if (oldTx.type === 'return') statsUpdates.totalReturn = (stats.totalReturn || 0) - oldTx.amount;
    if (oldTx.type === 'withdrawal') statsUpdates.totalWithdrawal = (stats.totalWithdrawal || 0) - oldTx.amount;

    tx.update(statsRef, statsUpdates);
    return { newBalance };
  });
});
```

### 4.3 `functions/src/index.ts`

```typescript
export { createTransaction, updateTransaction, voidTransaction } from './transactions';
```

---

## Phase 5: Frontend Implementation

### 5.1 Auth Provider & Protected Routes

**`src/providers/AuthProvider.tsx`**
```typescript
// Wraps firebase auth state, provides user + role via context
// Checks users/{uid} document for role
```

**`src/components/layout/ProtectedRoute.tsx`**
```typescript
// Redirects to /login if not authenticated
// Optionally checks role for maintainer-only routes
```

### 5.2 App Layout

**`src/components/layout/AppLayout.tsx`**
- Sidebar or top nav with: Dashboard, Members, Activity, Settings
- Header shows: Current FY, Current Maintainer name, Theme toggle
- Uses shadcn `Tabs` or `Sidebar` pattern

### 5.3 Pages

#### Dashboard (`src/pages/Dashboard.tsx`)
- StatCards: Pool Balance, Total Deposited, Total Returned, Total Withdrawn, Total Receivables, Current FY breakdown
- MemberSummaryTable: Member name, Net Balance, Receivable, FY deposited
- Uses `useQuery` to fetch stats/current + members + transactions

#### Members (`src/pages/Members.tsx` + `src/components/members/MemberDetail.tsx`)
- Table of all members with net balances
- Click → detail view with collapsible FY-grouped transactions
- Filters: FY, type

#### Activity (`src/pages/Activity.tsx`)
- Global ledger table (descending by date)
- Filters: FY, member, type, date range, search notes
- Pagination (Firestore `limit` + `startAfter`)
- Maintainer: Edit/Void buttons per row

#### Settings (`src/pages/Settings.tsx`)
- **Viewer mode**: Read-only payment details + current maintainer
- **Maintainer mode**:
  - UPI ID, Bank Details, QR upload (Firebase Storage)
  - Member management: Add, Deactivate
  - Maintainer handover: Select new maintainer → calls Cloud Function or direct Firestore update (with rules check)

#### Login (`src/pages/Login.tsx`)
- Email + Password form
- React Hook Form + Zod validation

### 5.4 Transaction Forms

**`src/components/transactions/AddTransactionDialog.tsx`**
- Two variants: Deposit/Return form, Withdrawal form
- Fields validated with Zod
- Calls `httpsCallable(functions, 'createTransaction')`
- Shows pool balance check error from server

**`src/components/transactions/EditTransactionDialog.tsx`**
- Similar to add, pre-filled
- Calls `updateTransaction` callable

**`src/components/transactions/VoidTransactionDialog.tsx`**
- Reason field (required)
- Calls `voidTransaction` callable

### 5.5 Reusable Components

- `TransactionTable.tsx`: TanStack Table with sorting, pagination
- `TransactionFilters.tsx`: FY dropdown, member dropdown, type filter, date range, search
- `StatCards.tsx`: shadcn Card-based stat display
- `MemberTable.tsx`: Member list with balances

---

## Phase 6: Seed & Import Scripts

### 6.1 `scripts/seed.ts`

```typescript
// Run with: npx tsx scripts/seed.ts
// Requires: FIREBASE_PROJECT_ID env + service account key
// Initializes:
// - config/app (fyStartMonth: 4, placeholder maintainer)
// - stats/current (poolBalance: 0, totals: 0)
// - members/{id} — initial member list (from config array)
// - users/{uid} — initial users with roles
```

### 6.2 `scripts/importExcel.ts`

```typescript
// Run with: npx tsx scripts/importExcel.ts --file "path/to/excel.xlsx"
// Uses xlsx (npm package) to parse workbook
// For each member sheet or row:
//   - Creates member if not exists
//   - Creates opening_balance transaction for each FY summary
//     with notes: "Opening balance FY 2025-2026 (imported from Excel)"
// Updates stats/current accordingly
```

---

## Phase 7: Configuration Files

### 7.1 `.env.example`
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 7.2 `firebase.json`
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

### 7.3 `storage.rules`
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /qr/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'maintainer';
    }
  }
}
```

---

## Phase 8: Tests

### 8.1 `src/utils/financialYear.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getFY, calculatePoolBalance, calculateMemberNet } from './financialYear';

describe('getFY', () => {
  it('returns 2025-2026 for April 2025', () => {
    expect(getFY(new Date(2025, 3, 1))).toBe('2025-2026');
  });
  it('returns 2025-2026 for January 2026', () => {
    expect(getFY(new Date(2026, 0, 15))).toBe('2025-2026');
  });
  it('returns 2026-2027 for April 2026', () => {
    expect(getFY(new Date(2026, 3, 1))).toBe('2026-2027');
  });
});

describe('calculatePoolBalance', () => {
  it('returns correct balance for mixed transactions', () => {
    const txs = [
      { type: 'deposit', amount: 1000, status: 'active' },
      { type: 'withdrawal', amount: 300, status: 'active' },
      { type: 'return', amount: 200, status: 'active' },
      { type: 'withdrawal', amount: 100, status: 'void' },
    ] as TransactionDoc[];
    expect(calculatePoolBalance(txs)).toBe(900);
  });
});
```

Run with `vitest`.

---

## Phase 9: README & Deployment

### 9.1 `README.md`

```markdown
# FaF Savings Pool

## Local Development
1. Copy `.env.example` to `.env` and fill Firebase config
2. `npm install`
3. `npm run dev`

## Firebase Setup
1. Create Firebase project
2. Enable Auth (Email/Password), Firestore, Storage
3. `npm install -g firebase-tools`
4. `firebase login`
5. `firebase use <project-id>`
6. Deploy rules: `firebase deploy --only firestore:rules,firestore:indexes`
7. Deploy functions: `firebase deploy --only functions`
8. Seed data: `npx tsx scripts/seed.ts`
9. Deploy hosting: `npm run build && firebase deploy --only hosting`

## Excel Import
`npx tsx scripts/importExcel.ts --file "path/to/excel.xlsx"`
```

---

## Implementation Order (Task Breakdown)

1. **Project initialization** — Vite, deps, shadcn/ui, config files
2. **Types, schemas, utilities** — TypeScript interfaces, Zod schemas, FY helpers, unit tests
3. **Firebase config** — firebase.ts, firestore.ts, rules, indexes
4. **Cloud Functions** — createTransaction, updateTransaction, voidTransaction with enforcement
5. **Auth + Layout** — AuthProvider, Login, AppLayout, ProtectedRoute
6. **Dashboard page** — StatCards, MemberSummaryTable
7. **Members page** — MemberTable, MemberDetail with FY grouping
8. **Activity page** — TransactionTable with filters, pagination
9. **Transaction forms** — Add/Edit/Void dialogs with callable integration
10. **Settings page** — Payment details, member management, maintainer handover, QR upload
11. **Seed script** — Initialize Firestore collections
12. **Excel import script** — Parse workbook, create members + opening_balance transactions
13. **Tests** — FY calculation, balance aggregation
14. **README + deployment docs**
