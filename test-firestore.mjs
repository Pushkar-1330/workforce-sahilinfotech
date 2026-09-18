import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
console.log('Connecting to Firebase:', config.projectId, 'Database:', config.firestoreDatabaseId);

const app = initializeApp(config);
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

async function check() {
  try {
    const memSnap = await getDocs(collection(db, 'members'));
    console.log(`✅ Members found in Firestore: ${memSnap.size}`);
    memSnap.forEach(d => console.log(`   - ${d.id}: ${d.data().name} (${d.data().role || 'Staff'})`));

    const attSnap = await getDocs(collection(db, 'attendance'));
    console.log(`✅ Attendance records found in Firestore: ${attSnap.size}`);

    const accSnap = await getDocs(collection(db, 'user_accounts'));
    console.log(`✅ User accounts found in Firestore: ${accSnap.size}`);
  } catch (err) {
    console.error('❌ Firestore check error:', err);
  }
}

check().then(() => process.exit(0));
