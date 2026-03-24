import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {

  db: Firestore;

  constructor() {

    const firebaseConfig = {
      apiKey: "AIzaSyBqpYV796eXqtahKx5O8QHdd0dUOCbHVZo",
      authDomain: "tcl-2026.firebaseapp.com",
      projectId: "tcl-2026",
      storageBucket: "tcl-2026.firebasestorage.app",
      messagingSenderId: "342890234890",
      appId: "1:342890234890:web:a63c44d802f3a2ad958bf3",
      measurementId: "G-HMPJ8SVZJM"
    };

    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);
  }

  // 🔥 ADD THIS FUNCTION
  async uploadImage(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'tcl_upload'); // 👈 तुझं preset

    const res = await fetch(
      'https://api.cloudinary.com/v1_1/dzlyg7wog/image/upload',
      {
        method: 'POST',
        body: formData
      }
    );

    const data = await res.json();
    return data.secure_url; // 👈 image URL return
  }
}