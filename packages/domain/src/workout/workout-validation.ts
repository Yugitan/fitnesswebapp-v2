import type { TrainingSet } from "./workout.types";

export function isMeaningfulSet(set: Pick<TrainingSet, "weightKg" | "reps">): boolean {
  return Boolean((set.weightKg && set.weightKg > 0) || (set.reps && set.reps > 0));
}
