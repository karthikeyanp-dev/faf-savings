# FaF Savings Pool

A production-ready private web app for managing a shared emergency savings pool among friends. Built with React + Vite + TypeScript + shadcn/ui and Firebase (Auth + Firestore).

**Pure Client-Side Rendering** - No Cloud Functions, no Storage. Deploy anywhere (Firebase Hosting, Vercel, Netlify).

## Features

- **Role-based access**: Maintainer (full access) and Viewer (read-only)
- **Transaction management**: Deposit, Withdrawal, Return, Interest, and Opening Balance
- **Opening balance configuration**: Set accumulated pre-FY balances for each member with optional opening interest
- **Pool balance enforcement**: Firestore Security Rules + client-side transactions ensure balance never goes negative
- **Financial Year tracking**: April-March fiscal year with automatic FY labeling
- **Real-time dashboard**: Pool balance, member balances, receivables, FY stats (deposited, withdrawn, interests)
- **Activity ledger**: Filterable, searchable transaction history
- **Member management**: Add, edit, deactivate/activate, view detailed transaction history per member
- **Settings**: Payment details (UPI, bank), QR code upload (base64), maintainer handover, opening balance configuration
- **Dark mode**: Toggle between light and dark themes
- **Excel import**: Script to import member data and opening balances
- **PWA support**: Progressive Web App with offline capabilities

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS, Framer Motion
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Backend**: Firebase (Authentication, Firestore) - **No Cloud Functions required**
- **Routing**: React Router v7
- **Testing**: Vitest

## Prerequisites

- Node.js 18+ and npm
- Firebase account and project
- Firebase CLI (`npm install -g firebase-tools`)

## Local Development

### 1. Clone and Install

```bash
npm install
```

### 2. Firebase Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable **Authentication** (Email/Password sign-in method)
3. Enable **Firestore Database** (start in production mode)
4. Copy your Firebase config from Project Settings > General > Your apps > Web app

**Note**: No need for Cloud Functions or Storage - this app uses pure client-side transactions!

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your Firebase configuration values.

### 4. Deploy Firestore Rules

```bash
# Login to Firebase
firebase login

# Select your project
firebase use <your-project-id>

# Deploy Firestore rules and indexes
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Seed Initial Data

```bash
# Install firebase-admin temporarily for the seed script
npm install -D firebase-admin

# Set your project ID
export FIREBASE_PROJECT_ID=your-project-id

# Run seed script (creates initial users, members, config)
npm run seed
```

This creates:

- Maintainer account: `maintainer@faf.local` / `Maintainer123!`
- Viewer account: `viewer@faf.local` / `Viewer123!`
- 5 placeholder members
- App config and stats documents

**⚠️ Change these passwords immediately after first login!**

### 6. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Deployment

### Firebase Hosting (Recommended)

```bash
# Build the app
npm run build

# Deploy to Firebase Hosting + Firestore rules/indexes
firebase deploy
```

This deploys:

- Firestore rules and indexes
- Hosting (with PWA support)

### Alternative Platforms

Since this is a pure static app, you can also deploy to:

- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy --prod`
- **GitHub Pages**: Push to `gh-pages` branch

**Note**: Remember to separately deploy Firestore rules using `firebase deploy --only firestore:rules`.

## Excel Import

If you have an existing Excel file with member summaries:

```bash
# Install dependencies for scripts
npm install -D xlsx @types/xlsx firebase-admin

# Run import
npm run import:excel -- path/to/your/excel.xlsx
```

The script will:

- Create members from the Excel file
- Create opening balance transactions for each FY summary
- Update the stats document

**Note**: Adjust the `importExcel.ts` script based on your actual Excel structure.

## Project Structure

```
faf-savings/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   ├── layout/          # AppLayout, BottomNav, MobileHeader, ProtectedRoute
│   │   ├── transactions/    # Transaction forms (Add/Edit/Void, Member add/edit, Opening Balance)
│   │   └── animations/      # Page transitions and stagger effects
│   ├── pages/               # Page components (Dashboard, Members, Activity, Settings, Login)
│   ├── lib/                 # Firebase config, Firestore queries, utils
│   ├── providers/           # AuthProvider, QueryProvider
│   ├── types/               # TypeScript interfaces
│   ├── schemas/             # Zod validation schemas
│   └── utils/               # Financial year calculations, formatting
├── scripts/
│   ├── seed.ts              # Database seeding (users, members, config)
│   ├── importExcel.ts       # Excel import for member/balance data
│   └── cleanup-transactions.ts  # Transaction cleanup utility
├── firestore.rules          # Firestore security rules (balance validation)
├── firestore.indexes.json   # Firestore composite indexes
├── firebase.json            # Firebase hosting config
├── vite.config.ts           # Vite config with PWA plugin
└── tailwind.config.js       # Tailwind CSS configuration
```

## Architecture

### Pure Client-Side Rendering (CSR)

This app uses **Firestore client-side transactions** with **Security Rules** for balance enforcement:

1. **Transaction writes** happen on the client via `runTransaction()`
2. **Security Rules** validate that:
   - Only maintainer can create/update transactions
   - New pool balance never goes negative
   - All amounts (except opening_balance) are positive
   - Void edits only allow status/voidReason/updatedAt fields
3. **Atomic updates** ensure transaction and stats stay in sync

**Transaction Flow:**

- **Deposit/Return**: Adds amount to pool balance
- **Withdrawal**: Subtracts amount from pool balance, checks `poolBalance >= amount`
- **Interest**: Adds amount to pool balance (no member association)
- **Opening Balance**: Sets initial balances from previous FY (no balance check)

**Benefits:**

- ✅ No Cloud Functions needed (Spark/free plan works)
- ✅ Simpler deployment
- ✅ Lower latency (no function cold starts)
- ✅ Cheaper (free tier sufficient)

### PWA (Progressive Web App)

The app includes PWA capabilities:

- Installable on mobile and desktop
- Works offline (cached assets)
- Auto-updates when new version is available
- Native app-like experience

## Usage

- **Maintainer**: Can create, edit, void transactions; manage members; update payment details; handover role
- **Viewer**: Read-only access to all data

### Transaction Types

- **Deposit**: Monthly savings contribution (requires savings month)
- **Withdrawal**: Taking money from the pool (requires sufficient balance)
- **Return**: Repaying money to the pool (not linked to specific withdrawal)
- **Interest**: Interest earned, added directly to pool balance (no member association)
- **Opening Balance**: Initial balance import from before current FY (configured in Settings)

### Opening Balances

Use the "Previous Balances" section in Settings to configure each member's accumulated balance from before the current financial year. This allows:

- Accurate member balance calculations from day one
- Tracking of previous FY contributions separately from current FY
- Optional "Opening Interest" field for interest already in the pool

Opening balances are recorded as special `opening_balance` transactions dated April 1 of the current FY.

### Financial Year

FY runs from **April 1 to March 31**.

- Apr-Dec 2025 → `2025-2026`
- Jan-Mar 2026 → `2025-2026`

### Opening Balances

Opening balances are set in the Settings page by the maintainer. They represent each member's accumulated balance from before the current financial year. These are stored in the `config` document as `openingBalances` (a map of member IDs to amounts) plus an optional `openingInterest` amount.

When calculating current balances:

1. Opening balance acts as the starting point for each member
2. Opening interest is added directly to the pool balance
3. All active transactions are then applied

**Security Rules behavior:**

- `opening_balance` type transactions bypass pool balance validation (allow negative/zero/positive)
- These are typically auto-created by the UI when setting opening balances via the Settings page

### Member Net Balance Calculation

```typescript
memberNet = openingBalance + sum(activeDeposits) - sum(activeWithdrawals);
```

- If `memberNet > 0`: Member has excess in pool (pool owes them)
- If `memberNet < 0`: Member owes money to the pool (outstanding receivable)

Tests cover:

- FY calculation
- Pool balance aggregation
- Member net balance calculation
- INR formatting

## Customization

### Add Custom Members

Update the `members` array in `scripts/seed.ts` before running the seed script, or add them via the Settings page after logging in as maintainer.

### Change Initial Credentials

Edit `CONFIG` in `scripts/seed.ts` to set your preferred email/password combinations.

### Styling

Modify CSS variables in `src/index.css` to customize the theme colors.

## Security

- All pages require Firebase Authentication
- Firestore rules prevent unauthorized writes to transactions, stats, and config
- Security rules enforce maintainer-only access for sensitive operations
- Balance validation happens both client-side (transactions) and server-side (rules)
- QR code uploads are base64-encoded directly to Firestore (maintainer only)

## Troubleshooting

### "Permission denied" errors

- Ensure Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Verify the user has the correct role in Firestore `users/{uid}` document
- Check browser console for detailed error messages

### TypeScript errors in scripts

- Install dev dependencies: `npm install -D firebase-admin xlsx @types/xlsx`

### "Transaction failed" errors

- Check Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Verify the user has maintainer role in Firestore `users/{uid}` document
- Check browser console for detailed error messages
- Ensure pool balance would not go negative after the transaction

## License

Private use only. Not for commercial distribution.

## Support

For issues or questions, contact the current maintainer in your friends group.
