import type { SetInput } from "./training-set.types";

export function calculateVolume(input: SetInput): number {
  return (input.weightKg ?? 0) * (input.reps ?? 0);
}
