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
        // 1. Check for Environment Variable first (for Vercel)
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            adminDb = getFirestore();
            initialized = true;
            console.log("Firebase Admin SDK initialized successfully from ENV.");
            return;
        }

        // 2. Fallback to Local file (for local development)
        const serviceAccountKeyPath = path.join(process.cwd(), 'firebase-service-account-key.json');
        
        if (!fs.existsSync(serviceAccountKeyPath)) {
            console.warn('Firebase Admin initialization skipped: No ENV and `firebase-service-account-key.json` not found.');
            initialized = true; // Mark as initialized to prevent re-attempts
            return;
        }

        const fileContent = fs.readFileSync(serviceAccountKeyPath, 'utf8');
        const serviceAccount = JSON.parse(fileContent);

        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        
        adminDb = getFirestore();
        initialized = true;
        console.log("Firebase Admin SDK initialized successfully from file.");

    } catch (e: any) {
        console.error("Firebase Admin SDK initialization failed:", e.message);
        adminDb = undefined;
    }
}

// Run the initialization function as soon as the module is loaded
initializeFirebaseAdmin();

export { adminDb };
