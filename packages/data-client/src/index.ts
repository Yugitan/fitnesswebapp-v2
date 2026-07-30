import type { TrainingSet, Workout, WorkoutBundle, WorkoutExercise } from "@xiaobai-amax/domain";
import { clearAuthToken, getAuthHeaders, getAuthToken } from "./auth-storage";

export * from "./auth";
export { AUTH_CHANGE_EVENT } from "./auth-storage";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export type TrainingTemplate = {
  id: string;
  kind: "built-in" | "custom";
  name: string;
  description: string;
  tag: string;
  exerciseIds: string[];
};

export type QuickExercises = {
  favorites: string[];
  recent: string[];
  recommended: Array<{
    id: string;
    name: string;
    exerciseIds: string[];
  }>;
};

export type DraftExerciseInput = {
  exerciseId: string;
  sets: Array<{
    weightKg?: number;
    reps?: number;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401 && getAuthToken()) {
      clearAuthToken();
    }
    const payload = await response.json().catch(() => undefined) as { error?: string } | undefined;
    throw new Error(payload?.error ?? `请求失败 (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getWorkoutBundle(workoutId: string) {
  return request<WorkoutBundle | undefined>(`/workouts/${encodeURIComponent(workoutId)}`);
}

export function listTrainingTemplates(): Promise<TrainingTemplate[]> {
  return request("/training/templates");
}

export function createTrainingTemplate(name: string, exerciseIds: string[]): Promise<TrainingTemplate> {
  return request("/training/templates", {
    method: "POST",
    body: JSON.stringify({ name, exerciseIds }),
  });
}

export function deleteTrainingTemplate(templateId: string): Promise<void> {
  return request(`/training/templates/${encodeURIComponent(templateId)}`, { method: "DELETE" });
}

export function updateTrainingTemplate(
  templateId: string,
  name: string,
  exerciseIds: string[],
): Promise<TrainingTemplate> {
  return request(`/training/templates/${encodeURIComponent(templateId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name, exerciseIds }),
  });
}

export function listQuickExercises(): Promise<QuickExercises> {
  return request("/training/quick-exercises");
}

export function getWorkoutBundleByDate(date: string) {
  return request<WorkoutBundle | undefined>(`/workouts/by-date/${encodeURIComponent(date)}`);
}

export function getTodayWorkout(date: string) {
  return request<WorkoutBundle | undefined>(`/workouts/today?date=${encodeURIComponent(date)}`);
}

export function listRecentWorkoutBundles(limit = 3) {
  return request<WorkoutBundle[]>(`/workouts/recent?limit=${limit}`);
}

export function listMonthWorkoutBundles(month: string) {
  return request<WorkoutBundle[]>(`/workouts?month=${encodeURIComponent(month)}`);
}

export function listAllWorkoutBundles() {
  return request<WorkoutBundle[]>("/workouts");
}

export function listWorkoutBundlesSince(start: string) {
  return request<WorkoutBundle[]>(`/workouts?start=${encodeURIComponent(start)}`);
}

export function getExerciseBodyParts(exerciseIds: string[]) {
  return request<Record<string, string>>("/analysis/exercise-body-parts", {
    method: "POST",
    body: JSON.stringify({ exerciseIds }),
  });
}

export async function listWorkouts(): Promise<Workout[]> {
  const bundles = await listAllWorkoutBundles();
  return bundles.map((bundle) => bundle.workout);
}

export function getOrCreateWorkout(date: string): Promise<Workout> {
  return request<Workout>("/workouts", {
    method: "POST",
    body: JSON.stringify({ date }),
  });
}

export function commitWorkout(
  date: string,
  exerciseIds: string[],
  notes: string,
  draftExercises: DraftExerciseInput[] = [],
): Promise<WorkoutBundle> {
  return request("/workouts/complete", {
    method: "POST",
    body: JSON.stringify({ date, exerciseIds, notes, draftExercises }),
  });
}

export function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  return request<WorkoutExercise>(`/workouts/${encodeURIComponent(workoutId)}/exercises`, {
    method: "POST",
    body: JSON.stringify({ exerciseId }),
  });
}

export async function addExerciseToToday(exerciseId: string, date: string): Promise<Workout> {
  const workout = await getOrCreateWorkout(date);
  await addExerciseToWorkout(workout.id, exerciseId);
  return workout;
}

export function addSet(workoutId: string, workoutExerciseId: string): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}/exercises/${encodeURIComponent(workoutExerciseId)}/sets`, {
    method: "POST",
    body: "{}",
  });
}

export function updateSet(workoutId: string, set: TrainingSet): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}/sets/${encodeURIComponent(set.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ weightKg: set.weightKg, reps: set.reps, notes: set.notes }),
  });
}

export function deleteSet(workoutId: string, setId: string): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}/sets/${encodeURIComponent(setId)}`, { method: "DELETE" });
}

export function deleteWorkoutExercise(workoutId: string, workoutExerciseId: string): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}/exercises/${encodeURIComponent(workoutExerciseId)}`, { method: "DELETE" });
}

export function deleteWorkout(workoutId: string): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}`, { method: "DELETE" });
}

export function updateWorkoutNotes(workoutId: string, notes: string): Promise<void> {
  return request(`/workouts/${encodeURIComponent(workoutId)}`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

export function listFavoriteExerciseIds(): Promise<string[]> {
  return request<string[]>("/favorite-exercises");
}

export async function toggleFavoriteExercise(exerciseId: string): Promise<boolean> {
  const favorites = await listFavoriteExerciseIds();
  const isFavorite = favorites.includes(exerciseId);
  await request(`/favorite-exercises/${encodeURIComponent(exerciseId)}`, {
    method: isFavorite ? "DELETE" : "PUT",
  });
  return !isFavorite;
}

export async function exportAllData(): Promise<string> {
  const payload = await request<Record<string, unknown>>("/data/export");
  return JSON.stringify(payload, null, 2);
}

export function importAllData(json: string): Promise<void> {
  return request("/data/import", { method: "PUT", body: json });
}

export function clearAllData(): Promise<void> {
  return request("/data", { method: "DELETE" });
}

export async function seedMayJuneTestWorkouts(): Promise<number> {
  const result = await request<{ count: number }>("/dev/seed", { method: "POST", body: "{}" });
  return result.count;
}
