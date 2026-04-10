import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

// Initialize Firebase Admin
initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = getFirestore();

function getFY(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  if (month >= 4) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

async function importExcel(filePath: string) {
  console.log(`📊 Importing Excel file: ${filePath}`);

  try {
    const workbook = XLSX.readFile(filePath);
    console.log('Sheets:', workbook.SheetNames);

    // This is a generic importer - adjust based on your Excel structure
    // For now, we'll create members and opening balances
    
    const membersToAdd = new Set<string>();
    const openingBalances: Array<{ memberName: string; fy: string; amount: number }> = [];

    // Parse all sheets
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<any>(sheet);

      console.log(`\nSheet: ${sheetName}`);
      console.log(`Rows: ${data.length}`);

      // Try to extract member names and balances
      // Adjust this logic based on your actual Excel structure
      for (const row of data) {
        const name = row['Name'] || row['name'] || row['Member'] || row['member'];
        const amount = row['Balance'] || row['balance'] || row['Amount'] || row['amount'];
        const fy = row['FY'] || row['fy'] || row['Year'] || row['year'];

        if (name) {
          membersToAdd.add(name);
          if (amount) {
            openingBalances.push({
              memberName: name,
              fy: fy || getFY(new Date().toISOString()),
              amount: parseFloat(amount),
            });
          }
        }
      }
    }

    console.log(`\nFound ${membersToAdd.size} members`);
    console.log(`Found ${openingBalances.length} opening balances`);

    // Create members
    console.log('\nCreating members...');
    const memberMap: Record<string, string> = {};

    for (const memberName of membersToAdd) {
      const memberRef = await db.collection('members').add({
        name: memberName,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      memberMap[memberName] = memberRef.id;
      console.log(`  ✓ ${memberName} (${memberRef.id})`);
    }

    // Create opening balance transactions
    console.log('\nCreating opening balance transactions...');
    let totalOpeningBalance = 0;

    const batch = db.batch();

    for (const balance of openingBalances) {
      const memberId = memberMap[balance.memberName];
      if (!memberId) {
        console.warn(`  ⚠️  Member not found: ${balance.memberName}`);
        continue;
      }

      const txRef = db.collection('transactions').doc();
      batch.set(txRef, {
        type: 'opening_balance',
        memberId,
        amount: balance.amount,
        date: new Date(),
        fy: balance.fy,
        notes: `Opening balance FY ${balance.fy} (imported from Excel)`,
        status: 'active',
        createdByUid: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      totalOpeningBalance += balance.amount;
      console.log(`  ✓ ${balance.memberName}: ₹${balance.amount} for FY ${balance.fy}`);
    }

    await batch.commit();

    // Update stats
    console.log('\nUpdating stats...');
    await db.collection('stats').doc('current').set({
      poolBalance: totalOpeningBalance,
      totalDeposit: totalOpeningBalance,
      totalReturn: 0,
      totalWithdrawal: 0,
      updatedAt: new Date(),
    });

    console.log('\n✅ Import complete!');
    console.log(`Total opening balance: ₹${totalOpeningBalance}`);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Get file path from command line
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx scripts/importExcel.ts <path-to-excel-file>');
  process.exit(1);
}

importExcel(filePath);
