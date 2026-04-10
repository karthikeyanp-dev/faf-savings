# FaF Savings Pool

A production-ready private web app for managing a shared emergency savings pool among friends. Built with React + Vite + TypeScript + shadcn/ui and Firebase (Auth + Firestore).

**Pure Client-Side Rendering** - No Cloud Functions, no Storage. Deploy anywhere (Firebase Hosting, Vercel, Netlify).

## Features

- **Role-based access**: Maintainer (full access) and Viewer (read-only)
- **Transaction management**: Deposit, Withdrawal, Return, and Opening Balance
- **Pool balance enforcement**: Firestore Security Rules + client-side transactions ensure balance never goes negative
- **Financial Year tracking**: April-March fiscal year with automatic FY labeling
- **Real-time dashboard**: Pool balance, member balances, receivables
- **Activity ledger**: Filterable, searchable transaction history
- **Member management**: Add, deactivate, view detailed transaction history
- **Settings**: Payment details, QR code (base64), maintainer handover
- **Dark mode**: Toggle between light and dark themes
- **Excel import**: Script to import member data and opening balances

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, shadcn/ui, Tailwind CSS
- **State Management**: TanStack Query
- **Forms**: React Hook Form + Zod validation
- **Backend**: Firebase (Auth, Firestore)
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

**Note**: No need for Cloud Functions or Storage - this app uses pure client-side transactions!

### 3. Configure Environment

```bash
cp .env.example .env
```

Fill in your Firebase config from Project Settings > General > Your apps > Web app.

### 4. Deploy Firebase Rules

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

**Note**: The seed script requires `firebase-admin`. Install it temporarily:
```bash
npm install -D firebase-admin
```

### 6. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Deployment

### Firebase Hosting

```bash
# Build the app
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Full Deployment

```bash
firebase deploy
```

This deploys:
- Firestore rules and indexes
- Hosting

### Alternative: Vercel/Netlify

Since this is a pure static app, you can also deploy to:
- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy --prod`
- **GitHub Pages**: Push to `gh-pages` branch

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
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # App layout, navigation
│   │   ├── transactions/    # Transaction forms (Add/Edit/Void)
│   │   ├── members/         # Member-related components
│   │   └── dashboard/       # Dashboard components
│   ├── pages/               # Page components
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Members.tsx
│   │   ├── Activity.tsx
│   │   └── Settings.tsx
│   ├── lib/                 # Firebase config, utilities
│   ├── providers/           # React context providers
│   ├── types/               # TypeScript types
│   ├── schemas/             # Zod validation schemas
│   ├── utils/               # Helper functions
│   └── hooks/               # Custom React hooks
├── functions/               # [REMOVED] Cloud Functions not needed
├── scripts/
│   ├── seed.ts              # Database seeding
│   └── importExcel.ts       # Excel import
├── firestore.rules          # Firestore security rules (includes balance validation)
├── firestore.indexes.json   # Firestore indexes
└── firebase.json            # Firebase config (no storage section)
```

## Architecture

### Pure Client-Side Rendering (CSR)

This app uses **Firestore client-side transactions** with **Security Rules** for balance enforcement:

1. **Transaction writes** happen on the client via `runTransaction()`
2. **Security Rules** validate that:
   - Only maintainer can create/update transactions
   - New pool balance never goes negative
   - All amounts are positive
3. **Atomic updates** ensure transaction and stats stay in sync

**Benefits:**
- ✅ No Cloud Functions needed (Spark/free plan works)
- ✅ Simpler deployment
- ✅ Lower latency (no function cold starts)
- ✅ Cheaper (free tier sufficient)

## Usage

- **Maintainer**: Can create, edit, void transactions; manage members; update payment details; handover role
- **Viewer**: Read-only access to all data

### Transaction Types

- **Deposit**: Monthly savings contribution (requires savings month)
- **Withdrawal**: Taking money from the pool (requires sufficient balance)
- **Return**: Repaying money to the pool (not linked to specific withdrawal)
- **Opening Balance**: Initial balance import from Excel

### Financial Year

FY runs from **April 1 to March 31**.
- Apr-Dec 2025 → `2025-2026`
- Jan-Mar 2026 → `2025-2026`

### Pool Balance Enforcement

All transaction writes use Firestore `runTransaction()` which:
1. Reads current stats document
2. Calculates new balance
3. Rejects if `newBalance < 0`
4. Atomically writes both transaction and stats

Firestore Security Rules provide an additional layer of validation:
```javascript
allow create: if isMaintainer() && 
                 request.resource.data.amount > 0 &&
                 get(/databases/$(database)/documents/stats/current).data.poolBalance + 
                 (request.resource.data.type in ['deposit', 'return', 'opening_balance'] 
                  ? request.resource.data.amount 
                  : -request.resource.data.amount) >= 0;
```

## Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm test -- --watch
```

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

- All pages require authentication
- Firestore rules prevent direct client writes to transactions and stats
- Cloud Functions enforce role checks and balance validation
- Storage rules restrict QR uploads to maintainer only

## Troubleshooting

### "Permission denied" errors
- Ensure Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Verify the user has the correct role in Firestore `users/{uid}` document

### Cloud Functions not working
- Check function logs: `firebase functions:log`
- Ensure functions are deployed: `firebase deploy --only functions`
- Verify Firebase project is on Blaze plan (required for Cloud Functions)

### TypeScript errors in scripts
- Install dev dependencies: `npm install -D firebase-admin xlsx @types/xlsx`

### "Transaction failed" errors
- Check Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Verify the user has maintainer role in Firestore `users/{uid}` document
- Check browser console for detailed error messages

## License

Private use only. Not for commercial distribution.

## Support

For issues or questions, contact the current maintainer in your friends group.
