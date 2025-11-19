// Firebase client initialization and exports for MV3 extensions
// Bundle this file with esbuild into a single IIFE that attaches to window.firebaseClient

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  reload
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

export function onIdTokenChangedListener(callback) {
  return onIdTokenChanged(auth, callback);
}

export function signInWithEmailPassword(email, password) {
  console.log('[Firebase Auth] signInWithEmailPassword called');
  console.log('[Firebase Auth] Email:', email);
  console.log('[Firebase Auth] Current user before sign in:', auth.currentUser?.uid);
  try {
    const result = signInWithEmailAndPassword(auth, email, password);
    console.log('[Firebase Auth] signInWithEmailAndPassword promise created:', result);
    // Add handlers to log when it completes
    if (result && typeof result.then === 'function') {
      result.then((userCredential) => {
        console.log('[Firebase Auth] ✅ Sign in promise resolved');
        console.log('[Firebase Auth] User credential:', userCredential?.user ? { uid: userCredential.user.uid, email: userCredential.user.email } : null);
        console.log('[Firebase Auth] Current user after sign in:', auth.currentUser?.uid);
      }).catch((error) => {
        console.error('[Firebase Auth] ❌ Sign in promise rejected:', error);
        console.error('[Firebase Auth] Error code:', error?.code);
        console.error('[Firebase Auth] Error message:', error?.message);
      });
    }
    return result;
  } catch (error) {
    console.error('[Firebase Auth] ❌ Error in signInWithEmailPassword:', error);
    throw error;
  }
}

export async function registerWithEmailPassword(email, password) {
  console.log('[Email Verification] Starting registration for:', email);
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  console.log('[Email Verification] User created:', { uid: userCredential.user?.uid, email: userCredential.user?.email });
  
  // Send verification email after registration
  if (userCredential.user) {
    try {
      console.log('[Email Verification] Sending verification email to:', userCredential.user.email);
      await sendEmailVerification(userCredential.user);
      console.log('[Email Verification] ✅ Verification email sent successfully');
    } catch (error) {
      console.error('[Email Verification] ❌ Error sending verification email:', error);
      console.error('[Email Verification] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      throw error; // Re-throw so UI can handle it
    }
  } else {
    console.warn('[Email Verification] ⚠️ No user in credential, cannot send verification email');
  }
  return userCredential;
}

export function signOutUser() {
  console.log('[Firebase Auth] signOutUser called');
  console.log('[Firebase Auth] Current user before sign out:', auth.currentUser?.uid);
  try {
    const result = signOut(auth);
    console.log('[Firebase Auth] signOut promise created:', result);
    // Add a then handler to log when it completes
    if (result && typeof result.then === 'function') {
      result.then(() => {
        console.log('[Firebase Auth] ✅ Sign out promise resolved');
        console.log('[Firebase Auth] Current user after sign out:', auth.currentUser);
      }).catch((error) => {
        console.error('[Firebase Auth] ❌ Sign out promise rejected:', error);
      });
    }
    return result;
  } catch (error) {
    console.error('[Firebase Auth] ❌ Error in signOutUser:', error);
    throw error;
  }
}

export async function sendVerificationEmail() {
  console.log('[Email Verification] sendVerificationEmail called');
  const user = requireUser();
  console.log('[Email Verification] Current user:', { 
    uid: user.uid, 
    email: user.email, 
    emailVerified: user.emailVerified 
  });
  
  if (user.emailVerified) {
    console.log('[Email Verification] ⚠️ Email already verified, skipping send');
    throw new Error('Email is already verified');
  }
  
  try {
    console.log('[Email Verification] Sending verification email to:', user.email);
    const result = await sendEmailVerification(user);
    console.log('[Email Verification] ✅ Verification email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('[Email Verification] ❌ Error sending verification email:', error);
    console.error('[Email Verification] Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function checkEmailVerified(forceReload = false) {
  console.log('[Email Verification] checkEmailVerified called, forceReload:', forceReload);
  const user = requireUser();
  console.log('[Email Verification] User before reload:', { 
    uid: user.uid, 
    email: user.email, 
    emailVerified: user.emailVerified 
  });
  
  // If we're being called from ID token change listener, don't reload (it causes infinite loop)
  if (!forceReload && window._isProcessingTokenChange) {
    console.log('[Email Verification] ⚠️ Token change in progress, skipping reload to avoid loop');
    return user.emailVerified;
  }
  
  try {
    // Only reload if explicitly requested (e.g., from manual check button)
    if (forceReload) {
      console.log('[Email Verification] Reloading user to get latest status...');
      await reload(user);
      console.log('[Email Verification] User after reload:', { 
        uid: user.uid, 
        email: user.email, 
        emailVerified: user.emailVerified 
      });
    } else {
      console.log('[Email Verification] Using current user.emailVerified without reload:', user.emailVerified);
    }
    return user.emailVerified;
  } catch (error) {
    console.error('[Email Verification] ❌ Error reloading user:', error);
    console.error('[Email Verification] Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    // Return current status if reload fails
    console.log('[Email Verification] Returning current emailVerified status:', user.emailVerified);
    return user.emailVerified;
  }
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


