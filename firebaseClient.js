// Firebase client initialization and exports for MV3 extensions
// Bundle this file with esbuild into a single IIFE that attaches to window.firebaseClient

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit as fsLimit
} from 'firebase/firestore';

// Use your real Firebase web config (safe to ship; access is enforced by rules)
const firebaseConfig = {
  apiKey: "AIzaSyARjB1PrtGtQI08_8bHPC2d9fNbrOvp1sQ",
  authDomain: "leetcodeextension-64ac6.firebaseapp.com",
  projectId: "leetcodeextension-64ac6",
  storageBucket: "leetcodeextension-64ac6.firebasestorage.app",
  messagingSenderId: "623995174552",
  appId: "1:623995174552:web:847ee6c174396383e29aed",
  measurementId: "G-04BB8PFB65"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

function initAuthPersistence() {
  // Returns a promise; call this during UI init
  return setPersistence(auth, indexedDBLocalPersistence);
}

async function enableOfflinePersistenceSafe() {
  try {
    await enableIndexedDbPersistence(db);
  } catch (err) {
    // Ignore if multiple tabs or unsupported; online mode will still work
    // console.warn('Firestore persistence not enabled:', err);
  }
}

export {
  firebaseApp,
  auth,
  db,
  initAuthPersistence,
  enableOfflinePersistenceSafe
};

export function onAuthChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signInWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function registerWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  return signOut(auth);
}

function requireUser() {
  const user = auth.currentUser;
  if (!user || !user.uid) {
    throw new Error('Not signed in');
  }
  return user;
}

function chatsCollectionRef(uid) {
  return collection(db, 'users', uid, 'chats');
}

function messagesCollectionRef(uid, chatId) {
  return collection(db, 'users', uid, 'chats', chatId, 'messages');
}

export async function ensureUserProfile() {
  const user = requireUser();
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  const baseData = {
    email: user.email || null,
    displayName: user.displayName || null,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
  if (snap.exists()) {
    await updateDoc(userRef, baseData);
  } else {
    await setDoc(userRef, { ...baseData, createdAt: serverTimestamp() });
  }
}

export async function createChat({ title, problemKey, problemUrl, model, systemPrompt, summary } = {}) {
  const user = requireUser();
  const now = serverTimestamp();
  const chatDoc = {
    title: title || 'New Chat',
    problemKey: problemKey || null,
    problemUrl: problemUrl || null,
    model: model || null,
    systemPrompt: systemPrompt || null,
    summary: summary || null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  };
  const ref = await addDoc(chatsCollectionRef(user.uid), chatDoc);
  return { chatId: ref.id };
}

export async function addMessageToChat({ chatId, role, content, model = null, toolCalls = [] } = {}) {
  if (!chatId) throw new Error('chatId is required');
  if (!role) throw new Error('role is required');
  if (typeof content !== 'string') throw new Error('content must be a string');
  const user = requireUser();

  const message = {
    role,
    content,
    model,
    toolCalls,
    createdAt: serverTimestamp()
  };
  await addDoc(messagesCollectionRef(user.uid, chatId), message);
  const chatRef = doc(db, 'users', user.uid, 'chats', chatId);
  await updateDoc(chatRef, { updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() });
}

export async function listChats({ max = 50 } = {}) {
  const user = requireUser();
  const q = query(chatsCollectionRef(user.uid), orderBy('lastMessageAt', 'desc'), fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ chatId: d.id, ...d.data() }));
}

export async function listMessages(chatId, { max = 500 } = {}) {
  if (!chatId) throw new Error('chatId is required');
  const user = requireUser();
  const q = query(messagesCollectionRef(user.uid, chatId), orderBy('createdAt', 'asc'), fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ messageId: d.id, ...d.data() }));
}


