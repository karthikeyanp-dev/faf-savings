import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Initialize Firebase Admin
// Try service account key file first, then fall back to application default credentials
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
const auth = getAuth();

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  maintainerEmail: 'maintainer@faf.local',
  maintainerPassword: 'Maintainer123!',
  maintainerName: 'Maintainer',
  viewerEmail: 'viewer@faf.local',
  viewerPassword: 'Viewer123!',
  viewerName: 'Viewer',
  members: [
    'Member 1',
    'Member 2',
    'Member 3',
    'Member 4',
    'Member 5',
  ],
};

async function seed() {
  console.log('🌱 Seeding database...');
  console.log(`Project ID: ${process.env.FIREBASE_PROJECT_ID || 'NOT SET'}`);
  console.log(`Auth: ${existsSync(serviceAccountPath) ? 'Service account key' : process.env.FIREBASE_TOKEN ? 'FIREBASE_TOKEN' : 'Application Default Credentials'}`);

  if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('❌ FIREBASE_PROJECT_ID environment variable is required');
    console.log('');
    console.log('Usage (Windows PowerShell):');
    console.log('  $env:FIREBASE_PROJECT_ID="your-project-id"; npm run seed');
    console.log('');
    console.log('With Firebase CI token:');
    console.log('  $env:FIREBASE_TOKEN="your-token"; $env:FIREBASE_PROJECT_ID="your-project-id"; npm run seed');
    console.log('');
    console.log('Usage (Mac/Linux):');
    console.log('  FIREBASE_PROJECT_ID=your-project-id npm run seed');
    process.exit(1);
  }

  try {
    // Create users in Firebase Auth
    console.log('Creating maintainer user...');
    const maintainerRecord = await auth.createUser({
      email: CONFIG.maintainerEmail,
      password: CONFIG.maintainerPassword,
      displayName: CONFIG.maintainerName,
    });

    console.log('Creating viewer user...');
    const viewerRecord = await auth.createUser({
      email: CONFIG.viewerEmail,
      password: CONFIG.viewerPassword,
      displayName: CONFIG.viewerName,
    });

    // Create user documents in Firestore
    console.log('Creating user documents...');
    await db.collection('users').doc(maintainerRecord.uid).set({
      uid: maintainerRecord.uid,
      displayName: CONFIG.maintainerName,
      email: CONFIG.maintainerEmail,
      role: 'maintainer',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('users').doc(viewerRecord.uid).set({
      uid: viewerRecord.uid,
      displayName: CONFIG.viewerName,
      email: CONFIG.viewerEmail,
      role: 'viewer',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create members
    console.log('Creating members...');
    for (const memberName of CONFIG.members) {
      await db.collection('members').add({
        name: memberName,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  ✓ ${memberName}`);
    }

    // Create config/app
    console.log('Creating app config...');
    await db.collection('config').doc('app').set({
      fyStartMonth: 4,
      currentMaintainerUid: maintainerRecord.uid,
      updatedAt: new Date(),
      updatedByUid: maintainerRecord.uid,
    });

    // Create stats/current
    console.log('Creating stats...');
    await db.collection('stats').doc('current').set({
      poolBalance: 0,
      totalDeposit: 0,
      totalReturn: 0,
      totalWithdrawal: 0,
      updatedAt: new Date(),
    });

    console.log('\n✅ Seeding complete!');
    console.log('\nLogin credentials:');
    console.log(`  Maintainer: ${CONFIG.maintainerEmail} / ${CONFIG.maintainerPassword}`);
    console.log(`  Viewer: ${CONFIG.viewerEmail} / ${CONFIG.viewerPassword}`);
    console.log('\n⚠️  Please change these passwords after first login!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
