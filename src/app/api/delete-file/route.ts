import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authHeader.split('Bearer ')[1];
    
    // Check if user exists to prevent random public deletions
    if (!adminDb) {
        return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return NextResponse.json({ error: 'Unauthorized User' }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL missing' }, { status: 400 });
    }

    // Only process URLs that belong to our Firebase Storage bucket
    const bucket = admin.storage().bucket();
    if (!url.includes(bucket.name)) {
       // If it's an external URL (e.g. from an old system or placeholder), we just ignore it.
       return NextResponse.json({ success: true, message: 'External URL ignored' });
    }

    // Extract file path from URL
    // Format: https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?alt=media&token=...
    let filePath = '';
    try {
        const urlObj = new URL(url);
        const pathPart = urlObj.pathname.split('/o/')[1];
        if (!pathPart) throw new Error("Invalid format");
        filePath = decodeURIComponent(pathPart);
    } catch (e) {
        return NextResponse.json({ error: 'Invalid Firebase Storage URL' }, { status: 400 });
    }

    const fileRef = bucket.file(filePath);
    
    // Check if file exists before deleting (optional but good for robustness)
    const [exists] = await fileRef.exists();
    if (exists) {
        await fileRef.delete();
        return NextResponse.json({ success: true, message: 'File deleted successfully' });
    } else {
        return NextResponse.json({ success: true, message: 'File already deleted or missing' });
    }

  } catch (error: any) {
    console.error("Delete API error:", error);
    return NextResponse.json({ error: 'Deletion failed: ' + error.message }, { status: 500 });
  }
}
