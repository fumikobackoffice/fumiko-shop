import { useState } from 'react';

export function useUploadImage(defaultPath?: string) {
  const uploadImage = async (file: File, customPath?: string): Promise<string> => {
    const path = customPath || defaultPath || 'uploads';
    const userId = localStorage.getItem('fumiko-user-id');
    
    if (!userId) {
        throw new Error("Unauthorized: Please log in first.");
    }
    
    if (!file.type.startsWith('image/')) {
        throw new Error("Only image files are allowed.");
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userId}`
        },
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.url;
  };

  const deleteImage = async (url: string): Promise<boolean> => {
    if (!url || !url.includes('firebasestorage.googleapis.com')) return false;
    
    const userId = localStorage.getItem('fumiko-user-id');
    if (!userId) return false;

    try {
        const response = await fetch('/api/delete-file', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userId}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        return response.ok;
    } catch (e) {
        console.error("Failed to delete image", e);
        return false;
    }
  };

  return { uploadImage, deleteImage };
}
