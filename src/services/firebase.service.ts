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
}