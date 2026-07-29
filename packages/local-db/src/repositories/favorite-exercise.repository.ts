import { idbRequest, openAppDb, transactionDone } from "../db";
import { STORES } from "../schema";

export type FavoriteExercise = {
  exerciseId: string;
  createdAt: string;
};

export async function listFavoriteExerciseIds(): Promise<string[]> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.favoriteExercises, "readonly");
  const favorites = await idbRequest<FavoriteExercise[]>(
    tx.objectStore(STORES.favoriteExercises).getAll(),
  );
  return favorites.map((favorite) => favorite.exerciseId);
}

export async function toggleFavoriteExercise(exerciseId: string): Promise<boolean> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.favoriteExercises, "readwrite");
  const store = tx.objectStore(STORES.favoriteExercises);
  const existing = await idbRequest<FavoriteExercise | undefined>(store.get(exerciseId));

  if (existing) {
    store.delete(exerciseId);
    await transactionDone(tx);
    return false;
  }

  store.put({
    exerciseId,
    createdAt: new Date().toISOString(),
  });
  await transactionDone(tx);
  return true;
}
