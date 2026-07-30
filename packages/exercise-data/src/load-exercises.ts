import type { ExerciseView, RawExercise } from "@xiaobai-amax/domain";
import { normalizeExercise } from "./normalize-exercise";

const EXERCISES_URL = "/exercises-dataset/data/exercises.json";

let cachedExercises: ExerciseView[] | null = null;
let loadingExercises: Promise<ExerciseView[]> | null = null;

export async function loadExercises(): Promise<ExerciseView[]> {
  if (cachedExercises) {
    return cachedExercises;
  }

  if (!loadingExercises) {
    loadingExercises = fetch(EXERCISES_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("动作数据加载失败");
        }

        const rawExercises = (await response.json()) as RawExercise[];
        cachedExercises = rawExercises.map(normalizeExercise);
        return cachedExercises;
      })
      .catch((error: unknown) => {
        loadingExercises = null;
        throw error;
      });
  }

  return loadingExercises;
}
