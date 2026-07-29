import type { ExerciseView, RawExercise } from "@xiaobai-amax/domain";
import { normalizeExercise } from "./normalize-exercise";

const EXERCISES_URL = "/exercises-dataset/data/exercises.json";

let cachedExercises: ExerciseView[] | null = null;

export async function loadExercises(): Promise<ExerciseView[]> {
  if (cachedExercises) {
    return cachedExercises;
  }

  const response = await fetch(EXERCISES_URL);

  if (!response.ok) {
    throw new Error("动作数据加载失败");
  }

  const rawExercises = (await response.json()) as RawExercise[];
  cachedExercises = rawExercises.map(normalizeExercise);
  return cachedExercises;
}
