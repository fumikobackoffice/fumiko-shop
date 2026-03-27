import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin'; // Ensure admin is initialized
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authHeader.split('Bearer ')[1];
    
    // Check if user exists to prevent random public uploads
    if (!adminDb) {
        return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
    }
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return NextResponse.json({ error: 'Unauthorized User' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const path = formData.get('path') as string | null;

    if (!file || !path) {
      return NextResponse.json({ error: 'File or path missing' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    const originalName = file.name || 'image.jpg';
    let fileExtension = originalName.includes('.') ? originalName.split('.').pop() : 'jpg';
    if (!fileExtension) fileExtension = 'jpg';
    
    const fileName = `${Date.now()}-${uuidv4()}.${fileExtension}`;
    const fullPath = `${path}/${fileName}`;

    const bucket = admin.storage().bucket();
    const fileRef = bucket.file(fullPath);

    // Create a Firebase-compatible download token
    const token = uuidv4();

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || 'image/jpeg',
        metadata: {
          firebaseStorageDownloadTokens: token,
        }
      },
    });

    // Construct the standard Firebase Storage download URL
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fullPath)}?alt=media&token=${token}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error("Upload API error:", error);
    return NextResponse.json({ error: 'Upload failed: ' + error.message }, { status: 500 });
  }
}
