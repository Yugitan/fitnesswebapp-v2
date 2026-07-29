import type { TrainingSet, Workout, WorkoutExercise } from "@xiaobai-amax/domain";
import { idbRequest, openAppDb, transactionDone } from "../db";
import { STORES } from "../schema";

type SeedWorkout = {
  date: string;
  exercises: Array<{
    exerciseId: string;
    sets: Array<{
      reps: number;
      weightKg?: number;
    }>;
  }>;
};

const testWorkouts: SeedWorkout[] = [
  {
    date: "2026-05-06",
    exercises: [
      { exerciseId: "0001", sets: [{ reps: 15 }, { reps: 12 }, { reps: 12 }] },
      { exerciseId: "3294", sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }] },
    ],
  },
  {
    date: "2026-05-15",
    exercises: [
      { exerciseId: "0007", sets: [{ reps: 12, weightKg: 32 }, { reps: 10, weightKg: 36 }, { reps: 10, weightKg: 36 }] },
      { exerciseId: "0002", sets: [{ reps: 12 }, { reps: 12 }, { reps: 10 }] },
      { exerciseId: "1512", sets: [{ reps: 8 }, { reps: 8 }] },
    ],
  },
  {
    date: "2026-05-27",
    exercises: [
      { exerciseId: "0003", sets: [{ reps: 20 }, { reps: 20 }, { reps: 18 }] },
      { exerciseId: "0006", sets: [{ reps: 16 }, { reps: 16 }, { reps: 14 }] },
    ],
  },
  {
    date: "2026-06-03",
    exercises: [
      { exerciseId: "3293", sets: [{ reps: 6 }, { reps: 5 }, { reps: 5 }] },
      { exerciseId: "0007", sets: [{ reps: 12, weightKg: 34 }, { reps: 10, weightKg: 38 }, { reps: 8, weightKg: 40 }] },
    ],
  },
  {
    date: "2026-06-12",
    exercises: [
      { exerciseId: "3294", sets: [{ reps: 12 }, { reps: 10 }, { reps: 10 }, { reps: 8 }] },
      { exerciseId: "3214", sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] },
    ],
  },
  {
    date: "2026-06-24",
    exercises: [
      { exerciseId: "0001", sets: [{ reps: 18 }, { reps: 15 }, { reps: 15 }] },
      { exerciseId: "0002", sets: [{ reps: 14 }, { reps: 12 }, { reps: 12 }] },
      { exerciseId: "1368", sets: [{ reps: 20 }, { reps: 20 }] },
    ],
  },
  {
    date: "2026-06-29",
    exercises: [
      { exerciseId: "0007", sets: [{ reps: 10, weightKg: 40 }, { reps: 8, weightKg: 42 }, { reps: 8, weightKg: 42 }] },
      { exerciseId: "3293", sets: [{ reps: 6 }, { reps: 6 }, { reps: 5 }] },
      { exerciseId: "0003", sets: [{ reps: 24 }, { reps: 20 }] },
    ],
  },
];

function timestampFor(date: string, hour: number, minute: number): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).toISOString();
}

function seedId(...parts: Array<string | number>): string {
  return `seed_${parts.join("_").replaceAll("-", "_")}`;
}

async function getSeedWorkoutIds(): Promise<string[]> {
  const db = await openAppDb();
  const tx = db.transaction(STORES.workouts, "readonly");
  const workouts = await idbRequest<Workout[]>(tx.objectStore(STORES.workouts).getAll());
  return workouts
    .filter((workout) => workout.id.startsWith("seed_workout_"))
    .map((workout) => workout.id);
}

async function getByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openAppDb();
  const tx = db.transaction(storeName, "readonly");
  return idbRequest<T[]>(tx.objectStore(storeName).index(indexName).getAll(value));
}

async function clearSeedWorkouts(): Promise<void> {
  const seedWorkoutIds = await getSeedWorkoutIds();
  const workoutExercises = (
    await Promise.all(
      seedWorkoutIds.map((workoutId) =>
        getByIndex<WorkoutExercise>(STORES.workoutExercises, "workoutId", workoutId),
      ),
    )
  ).flat();
  const trainingSets = (
    await Promise.all(
      workoutExercises.map((workoutExercise) =>
        getByIndex<TrainingSet>(STORES.trainingSets, "workoutExerciseId", workoutExercise.id),
      ),
    )
  ).flat();

  const db = await openAppDb();
  const tx = db.transaction(
    [STORES.workouts, STORES.workoutExercises, STORES.trainingSets],
    "readwrite",
  );

  seedWorkoutIds.forEach((workoutId) => tx.objectStore(STORES.workouts).delete(workoutId));
  workoutExercises.forEach((workoutExercise) =>
    tx.objectStore(STORES.workoutExercises).delete(workoutExercise.id),
  );
  trainingSets.forEach((set) => tx.objectStore(STORES.trainingSets).delete(set.id));
  await transactionDone(tx);
}

export async function seedMayJuneTestWorkouts(): Promise<number> {
  await clearSeedWorkouts();

  const workouts: Workout[] = [];
  const workoutExercises: WorkoutExercise[] = [];
  const trainingSets: TrainingSet[] = [];

  testWorkouts.forEach((seedWorkout, workoutIndex) => {
    const workoutId = seedId("workout", seedWorkout.date);
    const timestamp = timestampFor(seedWorkout.date, 20, workoutIndex);
    workouts.push({
      id: workoutId,
      date: seedWorkout.date,
      notes: "开发测试数据",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    seedWorkout.exercises.forEach((exercise, exerciseIndex) => {
      const workoutExerciseId = seedId("workout_exercise", seedWorkout.date, exerciseIndex);
      workoutExercises.push({
        id: workoutExerciseId,
        workoutId,
        exerciseId: exercise.exerciseId,
        sortOrder: exerciseIndex,
        notes: "开发测试数据",
      });

      exercise.sets.forEach((set, setIndex) => {
        trainingSets.push({
          id: seedId("set", seedWorkout.date, exerciseIndex, setIndex),
          workoutExerciseId,
          setNumber: setIndex + 1,
          weightKg: set.weightKg,
          reps: set.reps,
          createdAt: timestampFor(seedWorkout.date, 20, workoutIndex + setIndex + 1),
        });
      });
    });
  });

  const db = await openAppDb();
  const tx = db.transaction(
    [STORES.workouts, STORES.workoutExercises, STORES.trainingSets],
    "readwrite",
  );

  workouts.forEach((workout) => tx.objectStore(STORES.workouts).put(workout));
  workoutExercises.forEach((workoutExercise) =>
    tx.objectStore(STORES.workoutExercises).put(workoutExercise),
  );
  trainingSets.forEach((set) => tx.objectStore(STORES.trainingSets).put(set));
  await transactionDone(tx);

  return workouts.length;
}
