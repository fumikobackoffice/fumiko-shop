import admin from 'firebase-admin';
import { getFirestore } from "firebase-admin/firestore";
import * as fs from 'fs';
import * as path from 'path';

let adminDb: admin.firestore.Firestore | undefined;
let initialized = false;

function initializeFirebaseAdmin() {
    if (initialized) {
        return;
    }

    try {
        // 1. Define the path to the key file (at the project root)
        const serviceAccountKeyPath = path.join(process.cwd(), 'firebase-service-account-key.json');
        
        // 2. Check if the file actually exists
        if (!fs.existsSync(serviceAccountKeyPath)) {
            console.warn('Firebase Admin initialization skipped: `firebase-service-account-key.json` not found.');
            initialized = true; // Mark as initialized to prevent re-attempts
            return;
        }

        // 3. Read the file as a UTF-8 string
        const fileContent = fs.readFileSync(serviceAccountKeyPath, 'utf8');
        
        // 4. Parse it into an object (JSON.parse will handle \n correctly)
        const serviceAccount = JSON.parse(fileContent);

        // 5. Initialize the Firebase Admin app if not already done
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        
        adminDb = getFirestore();
        initialized = true;
        console.log("Firebase Admin SDK initialized successfully.");

    } catch (e: any) {
        console.error("Firebase Admin SDK initialization failed:", e.message);
        adminDb = undefined;
    }
}

// Run the initialization function as soon as the module is loaded
initializeFirebaseAdmin();

export { adminDb };
