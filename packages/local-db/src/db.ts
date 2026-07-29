import { DB_NAME, DB_VERSION, STORES } from "./schema";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openAppDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.workouts)) {
        const store = db.createObjectStore(STORES.workouts, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.workoutExercises)) {
        const store = db.createObjectStore(STORES.workoutExercises, { keyPath: "id" });
        store.createIndex("workoutId", "workoutId", { unique: false });
        store.createIndex("exerciseId", "exerciseId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.trainingSets)) {
        const store = db.createObjectStore(STORES.trainingSets, { keyPath: "id" });
        store.createIndex("workoutExerciseId", "workoutExerciseId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.favoriteExercises)) {
        db.createObjectStore(STORES.favoriteExercises, { keyPath: "exerciseId" });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
