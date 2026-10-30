import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Community, Post, Comment, User } from '../types';
import {
  INITIAL_COMMUNITIES,
  INITIAL_POSTS,
  INITIAL_COMMENTS,
  INITIAL_USERS,
} from '../data/initialData';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: getFirestore with databaseId as required by AI Studio Firestore integration
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or connecting...');
    }
    return false;
  }
}

// Initialise connection test
testConnection();

// Safe document ID from email
export function getEmailUserId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
}

/* =========================================================
   REAL-TIME SUBSCRIPTIONS
========================================================= */

// Subscribe to all Communities in Real-Time
export function subscribeCommunities(callback: (communities: Community[]) => void): () => void {
  const collRef = collection(db, 'communities');
  return onSnapshot(
    collRef,
    (snapshot) => {
      if (snapshot.empty) {
        // If Firestore is brand new, seed with initial communities
        seedInitialCommunities();
        callback(INITIAL_COMMUNITIES);
        return;
      }
      const list: Community[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as Community);
      });
      // Sort alphabetically or by custom flag
      list.sort((a, b) => a.name.localeCompare(b.name));
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'communities');
    }
  );
}

// Subscribe to all Posts in Real-Time
export function subscribePosts(callback: (posts: Post[]) => void): () => void {
  const collRef = collection(db, 'posts');
  return onSnapshot(
    collRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialPosts();
        callback(INITIAL_POSTS);
        return;
      }
      const list: Post[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as Post);
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    }
  );
}

// Subscribe to all Comments in Real-Time
export function subscribeComments(callback: (comments: Comment[]) => void): () => void {
  const collRef = collection(db, 'comments');
  return onSnapshot(
    collRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialComments();
        callback(INITIAL_COMMENTS);
        return;
      }
      const list: Comment[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as Comment);
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'comments');
    }
  );
}

// Subscribe to all Users in Real-Time
export function subscribeUsers(callback: (users: User[]) => void): () => void {
  const collRef = collection(db, 'users');
  return onSnapshot(
    collRef,
    (snapshot) => {
      if (snapshot.empty) {
        seedInitialUsers();
        callback(INITIAL_USERS);
        return;
      }
      const list: User[] = [];
      snapshot.forEach((d) => {
        list.push(d.data() as User);
      });
      callback(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    }
  );
}

/* =========================================================
   SEEDING LOGIC FOR ZERO-EMPTY DATA
========================================================= */

let hasSeeded = false;

async function seedInitialCommunities() {
  if (hasSeeded) return;
  try {
    for (const comm of INITIAL_COMMUNITIES) {
      await setDoc(doc(db, 'communities', comm.id), comm, { merge: true });
    }
  } catch (err) {
    console.warn('Community seeding note:', err);
  }
}

async function seedInitialPosts() {
  try {
    for (const post of INITIAL_POSTS) {
      await setDoc(doc(db, 'posts', post.id), post, { merge: true });
    }
  } catch (err) {
    console.warn('Posts seeding note:', err);
  }
}

async function seedInitialComments() {
  try {
    for (const comment of INITIAL_COMMENTS) {
      await setDoc(doc(db, 'comments', comment.id), comment, { merge: true });
    }
  } catch (err) {
    console.warn('Comments seeding note:', err);
  }
}

async function seedInitialUsers() {
  try {
    for (const user of INITIAL_USERS) {
      const userDocId = getEmailUserId(user.email);
      await setDoc(doc(db, 'users', userDocId), user, { merge: true });
    }
    hasSeeded = true;
  } catch (err) {
    console.warn('Users seeding note:', err);
  }
}

/* =========================================================
   USER AUTH & CLOUD PROFILE MANAGEMENT
========================================================= */

// Save or update student user in Firestore
export async function saveUserToFirestore(user: User): Promise<void> {
  const userDocId = getEmailUserId(user.email);
  const path = `users/${userDocId}`;
  try {
    await setDoc(doc(db, 'users', userDocId), user, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch user profile from Firestore by email
export async function getUserFromFirestore(email: string): Promise<User | null> {
  const userDocId = getEmailUserId(email);
  const path = `users/${userDocId}`;
  try {
    const docSnap = await getDoc(doc(db, 'users', userDocId));
    if (docSnap.exists()) {
      return docSnap.data() as User;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

// Fetch all registered users
export async function getAllUsersFromFirestore(): Promise<User[]> {
  const path = 'users';
  try {
    const snap = await getDocs(collection(db, path));
    const list: User[] = [];
    snap.forEach((d) => list.push(d.data() as User));
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Sign In with Google via Firebase Auth
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser: FirebaseUser = result.user;
    if (!fbUser.email) return null;

    // Check if user already has an academic profile
    let existingUser = await getUserFromFirestore(fbUser.email);
    if (!existingUser) {
      const colors = ['bg-indigo-600', 'bg-emerald-600', 'bg-blue-600', 'bg-amber-600', 'bg-rose-600', 'bg-purple-600'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      existingUser = {
        id: fbUser.uid,
        name: fbUser.displayName || fbUser.email.split('@')[0],
        email: fbUser.email.toLowerCase(),
        passkey: 'google-oauth',
        avatarColor: randomColor,
        joinedDate: 'Oct 2026',
        course: 'Computer Science & Engineering',
        semester: 'Semester 4',
        bio: 'Learning and collaborating with peer students on StudyCircle.',
      };
      await saveUserToFirestore(existingUser);
    }
    return existingUser;
  } catch (error) {
    console.error('Google Sign In failed:', error);
    throw error;
  }
}

export async function signOutFirebaseUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

/* =========================================================
   COMMUNITY MUTATIONS
========================================================= */

export async function createCommunityInFirestore(community: Community): Promise<void> {
  const path = `communities/${community.id}`;
  try {
    await setDoc(doc(db, 'communities', community.id), community);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/* =========================================================
   POST MUTATIONS
========================================================= */

export async function createPostInFirestore(post: Post): Promise<void> {
  const path = `posts/${post.id}`;
  try {
    await setDoc(doc(db, 'posts', post.id), post);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePostInFirestore(postId: string, data: Partial<Post>): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await updateDoc(doc(db, 'posts', postId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePostFromFirestore(postId: string): Promise<void> {
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* =========================================================
   COMMENT MUTATIONS
========================================================= */

export async function createCommentInFirestore(comment: Comment): Promise<void> {
  const path = `comments/${comment.id}`;
  try {
    await setDoc(doc(db, 'comments', comment.id), comment);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCommentInFirestore(commentId: string, data: Partial<Comment>): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    await updateDoc(doc(db, 'comments', commentId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCommentFromFirestore(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    await deleteDoc(doc(db, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
