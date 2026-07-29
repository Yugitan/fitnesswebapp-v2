import type { TrainingSet, WorkoutBundle, WorkoutSummary } from "./workout.types";

export function calculateSetVolume(set: Pick<TrainingSet, "weightKg" | "reps">): number {
  return (set.weightKg ?? 0) * (set.reps ?? 0);
}

export function summarizeWorkout(bundle?: WorkoutBundle | null): WorkoutSummary {
  if (!bundle) {
    return {
      exerciseCount: 0,
      setCount: 0,
      totalVolume: 0,
    };
  }

  const sets = bundle.exercises.flatMap((item) => item.sets);

  return {
    exerciseCount: bundle.exercises.length,
    setCount: sets.length,
    totalVolume: sets.reduce((total, set) => total + calculateSetVolume(set), 0),
  };
}
