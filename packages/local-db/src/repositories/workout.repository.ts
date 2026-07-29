import type { TrainingSet, Workout, WorkoutBundle, WorkoutExercise } from "@xiaobai-amax/domain";
import { idbRequest, openAppDb, transactionDone } from "../db";
import { STORES } from "../schema";

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function todayDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function now(): string {
  return new Date().toISOString();
}

async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openAppDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName).index(indexName);
  return idbRequest<T[]>(store.getAll(value));
}

export async function getWorkoutByDate(date: string): Promise<Workout | undefined> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readonly");
  const request = tx.objectStore(STORES.workouts).index("date").get(date);
  return idbRequest<Workout | undefined>(request);
}

async function getWorkout(workoutId: string): Promise<Workout | undefined> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readonly");
  return idbRequest<Workout | undefined>(tx.objectStore(STORES.workouts).get(workoutId));
}

export async function getOrCreateWorkout(date = todayDate()): Promise<Workout> {
  const existing = await getWorkoutByDate(date);

  if (existing) {
    return existing;
  }

  const timestamp = now();
  const workout: Workout = {
    id: createId("workout"),
    date,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readwrite");
  tx.objectStore(STORES.workouts).put(workout);
  await transactionDone(tx);
  return workout;
}

export async function listWorkouts(): Promise<Workout[]> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readonly");
  const workouts = await idbRequest<Workout[]>(tx.objectStore(STORES.workouts).getAll());
  return workouts.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getWorkoutBundle(workoutId: string): Promise<WorkoutBundle | undefined> {
  const workout = await getWorkout(workoutId);

  if (!workout) {
    return undefined;
  }

  const workoutExercises = await getByIndex<WorkoutExercise>(
    STORES.workoutExercises,
    "workoutId",
    workoutId,
  );

  const exercises = await Promise.all(
    workoutExercises
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (workoutExercise) => {
        const sets = await getByIndex<TrainingSet>(
          STORES.trainingSets,
          "workoutExerciseId",
          workoutExercise.id,
        );

        return {
          workoutExercise,
          sets: sets.sort((a, b) => a.setNumber - b.setNumber),
        };
      }),
  );

  return {
    workout,
    exercises,
  };
}

export async function getWorkoutBundleByDate(date: string): Promise<WorkoutBundle | undefined> {
  const workout = await getWorkoutByDate(date);
  return workout ? getWorkoutBundle(workout.id) : undefined;
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
): Promise<WorkoutExercise> {
  const [existing, workout] = await Promise.all([
    getByIndex<WorkoutExercise>(STORES.workoutExercises, "workoutId", workoutId),
    getWorkout(workoutId),
  ]);
  const timestamp = now();
  const workoutExercise: WorkoutExercise = {
    id: createId("workoutExercise"),
    workoutId,
    exerciseId,
    sortOrder: existing.length,
  };
  const firstSet: TrainingSet = {
    id: createId("set"),
    workoutExerciseId: workoutExercise.id,
    setNumber: 1,
    reps: 10,
    createdAt: timestamp,
  };

  const db = await openAppDb();
  const tx = db.transaction(
    [STORES.workoutExercises, STORES.trainingSets, STORES.workouts],
    "readwrite",
  );
  tx.objectStore(STORES.workoutExercises).put(workoutExercise);
  tx.objectStore(STORES.trainingSets).put(firstSet);
  if (workout) {
    tx.objectStore(STORES.workouts).put({ ...workout, updatedAt: timestamp });
  }
  await transactionDone(tx);
  return workoutExercise;
}

export async function addExerciseToToday(exerciseId: string): Promise<Workout> {
  const workout = await getOrCreateWorkout(todayDate());
  await addExerciseToWorkout(workout.id, exerciseId);
  return workout;
}

export async function addSet(workoutId: string, workoutExerciseId: string): Promise<void> {
  const [sets, workout] = await Promise.all([
    getByIndex<TrainingSet>(STORES.trainingSets, "workoutExerciseId", workoutExerciseId),
    getWorkout(workoutId),
  ]);
  const lastSet = sets.sort((a, b) => b.setNumber - a.setNumber)[0];
  const timestamp = now();
  const set: TrainingSet = {
    id: createId("set"),
    workoutExerciseId,
    setNumber: sets.length + 1,
    weightKg: lastSet?.weightKg,
    reps: lastSet?.reps ?? 10,
    createdAt: timestamp,
  };

  const db = await openAppDb();
  const tx = db.transaction([STORES.trainingSets, STORES.workouts], "readwrite");
  tx.objectStore(STORES.trainingSets).put(set);
  if (workout) {
    tx.objectStore(STORES.workouts).put({ ...workout, updatedAt: timestamp });
  }
  await transactionDone(tx);
}

export async function updateSet(workoutId: string, set: TrainingSet): Promise<void> {
  const workout = await getWorkout(workoutId);
  const db = await openAppDb();
  const tx = db.transaction([STORES.trainingSets, STORES.workouts], "readwrite");
  tx.objectStore(STORES.trainingSets).put(set);
  if (workout) {
    tx.objectStore(STORES.workouts).put({ ...workout, updatedAt: now() });
  }
  await transactionDone(tx);
}

export async function deleteSet(workoutId: string, setId: string): Promise<void> {
  const workout = await getWorkout(workoutId);
  const db = await openAppDb();
  const tx = db.transaction([STORES.trainingSets, STORES.workouts], "readwrite");
  tx.objectStore(STORES.trainingSets).delete(setId);
  if (workout) {
    tx.objectStore(STORES.workouts).put({ ...workout, updatedAt: now() });
  }
  await transactionDone(tx);
}

export async function deleteWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string,
): Promise<void> {
  const [sets, workout] = await Promise.all([
    getByIndex<TrainingSet>(STORES.trainingSets, "workoutExerciseId", workoutExerciseId),
    getWorkout(workoutId),
  ]);
  const db = await openAppDb();
  const tx = db.transaction(
    [STORES.workoutExercises, STORES.trainingSets, STORES.workouts],
    "readwrite",
  );
  tx.objectStore(STORES.workoutExercises).delete(workoutExerciseId);
  sets.forEach((set) => tx.objectStore(STORES.trainingSets).delete(set.id));
  if (workout) {
    tx.objectStore(STORES.workouts).put({ ...workout, updatedAt: now() });
  }
  await transactionDone(tx);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const workoutExercises = await getByIndex<WorkoutExercise>(
    STORES.workoutExercises,
    "workoutId",
    workoutId,
  );
  const setsByExercise = await Promise.all(
    workoutExercises.map((workoutExercise) =>
      getByIndex<TrainingSet>(STORES.trainingSets, "workoutExerciseId", workoutExercise.id),
    ),
  );
  const db = await openAppDb();
  const tx = db.transaction(
    [STORES.workouts, STORES.workoutExercises, STORES.trainingSets],
    "readwrite",
  );

  tx.objectStore(STORES.workouts).delete(workoutId);
  workoutExercises.forEach((workoutExercise) =>
    tx.objectStore(STORES.workoutExercises).delete(workoutExercise.id),
  );
  setsByExercise.flat().forEach((set) => tx.objectStore(STORES.trainingSets).delete(set.id));
  await transactionDone(tx);
}

export async function updateWorkoutNotes(workoutId: string, notes: string): Promise<void> {
  const workout = await getWorkout(workoutId);
  if (!workout) return;
  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readwrite");
  tx.objectStore(STORES.workouts).put({ ...workout, notes, updatedAt: now() });
  await transactionDone(tx);
}

export async function exportAllData(): Promise<string> {
  const db = await openAppDb();
  const tx = db.transaction(Object.values(STORES), "readonly");
  const payload: Record<string, unknown> = {
    version: 1,
    exportedAt: now(),
  };

  await Promise.all(
    Object.values(STORES).map(async (storeName) => {
      payload[storeName] = await idbRequest(tx.objectStore(storeName).getAll());
    }),
  );

  return JSON.stringify(payload, null, 2);
}

export async function clearAllData(): Promise<void> {
  const db = await openAppDb();
  const tx = db.transaction(Object.values(STORES), "readwrite");
  Object.values(STORES).forEach((storeName) => tx.objectStore(storeName).clear());
  await transactionDone(tx);
}

export async function importAllData(json: string): Promise<void> {
  const payload = JSON.parse(json) as Record<string, unknown>;
  const db = await openAppDb();
  const tx = db.transaction(Object.values(STORES), "readwrite");

  Object.values(STORES).forEach((storeName) => tx.objectStore(storeName).clear());

  Object.values(STORES).forEach((storeName) => {
    const rows = payload[storeName];

    if (Array.isArray(rows)) {
      rows.forEach((row) => tx.objectStore(storeName).put(row));
    }
  });

  await transactionDone(tx);
}
