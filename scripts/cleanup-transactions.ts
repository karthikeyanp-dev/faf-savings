import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

// Initialize Firebase Admin
const serviceAccountPath = resolve(process.cwd(), 'service-account-key.json');

if (existsSync(serviceAccountPath)) {
  console.log('🔑 Using service account key file');
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount as any),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
  });
} else {
  console.log('🔑 Using Application Default Credentials (FIREBASE_TOKEN or gcloud)');
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = getFirestore();

/**
 * Delete all documents in a collection using batched writes.
 * Firestore batches support up to 500 operations per batch.
 */
async function deleteCollection(collectionPath: string): Promise<number> {
  const BATCH_SIZE = 500;
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await db.collection(collectionPath).limit(BATCH_SIZE).get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.size;
    console.log(`  Deleted ${snapshot.size} documents from ${collectionPath} (total: ${totalDeleted})`);

    // If we got fewer than BATCH_SIZE, we've reached the end
    if (snapshot.size < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return totalDeleted;
}

function askConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function cleanup() {
  console.log('🧹 Transactions Cleanup Script');
  console.log(`Project ID: ${process.env.FIREBASE_PROJECT_ID || 'NOT SET'}`);
  console.log(`Auth: ${existsSync(serviceAccountPath) ? 'Service account key' : process.env.FIREBASE_TOKEN ? 'FIREBASE_TOKEN' : 'Application Default Credentials'}`);
  console.log('');

  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('❌ FIREBASE_PROJECT_ID environment variable is required');
    console.log('');
    console.log('Usage (Windows PowerShell):');
    console.log('  $env:FIREBASE_PROJECT_ID="your-project-id"; npm run cleanup:transactions');
    console.log('');
    console.log('With Firebase CI token:');
    console.log('  $env:FIREBASE_TOKEN="your-token"; $env:FIREBASE_PROJECT_ID="your-project-id"; npm run cleanup:transactions');
    console.log('');
    console.log('Usage (Mac/Linux):');
    console.log('  FIREBASE_PROJECT_ID=your-project-id npm run cleanup:transactions');
    process.exit(1);
  }

  // Check what we're about to delete
  console.log('📋 Checking current state...');
  const transactionsSnapshot = await db.collection('transactions').count().get();
  const transactionCount = transactionsSnapshot.data().count;
  console.log(`  Found ${transactionCount} transaction(s) in database`);
  console.log('');

  if (transactionCount === 0) {
    console.log('✅ No transactions to delete. Database is already clean.');
    return;
  }

  console.log('⚠️  This will PERMANENTLY delete:');
  console.log(`  - All ${transactionCount} transaction(s) from 'transactions' collection`);
  console.log('  - Reset stats/current (poolBalance, totals) to zero');
  console.log('');
  console.log('  Members, users, config, and maintainerHistory will NOT be affected.');
  console.log('');

  // Confirm before proceeding
  const confirmed = await askConfirmation('Are you sure you want to proceed? (yes/no): ');
  if (!confirmed) {
    console.log('❌ Cleanup cancelled.');
    process.exit(0);
  }

  try {
    // Delete all transactions
    console.log('\n🗑️  Deleting transactions...');
    const deletedCount = await deleteCollection('transactions');
    console.log(`  ✓ Deleted ${deletedCount} transaction(s)`);

    // Reset stats/current to zero
    console.log('\n🔄 Resetting stats/current...');
    await db.collection('stats').doc('current').set({
      poolBalance: 0,
      totalDeposit: 0,
      totalReturn: 0,
      totalWithdrawal: 0,
      totalInterest: 0,
      updatedAt: new Date(),
    });
    console.log('  ✓ Stats reset to zero');

    console.log('\n✅ Cleanup complete!');
    console.log(`   ${deletedCount} transaction(s) deleted, stats reset to zero.`);
    console.log('   Run "npm run seed" if you want to start fresh with seed data.');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanup();
