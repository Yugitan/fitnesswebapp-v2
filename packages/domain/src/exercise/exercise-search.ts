import type { ExerciseFilters, ExerciseView } from "./exercise.types";

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}

export function filterExercises(
  exercises: ExerciseView[],
  filters: ExerciseFilters,
): ExerciseView[] {
  const query = normalizeSearchText(filters.query);

  return exercises.filter((exercise) => {
    const matchesQuery = query.length === 0 || exercise.searchText.includes(query);
    const matchesBodyPart = filters.bodyPart === "all" || exercise.bodyPart === filters.bodyPart;
    const matchesEquipment = filters.equipment === "all" || exercise.equipment === filters.equipment;

    return matchesQuery && matchesBodyPart && matchesEquipment;
  });
}

export function getUniqueOptions<T extends keyof ExerciseView>(
  exercises: ExerciseView[],
  key: T,
): string[] {
  return Array.from(new Set(exercises.map((exercise) => String(exercise[key])))).sort((a, b) =>
    a.localeCompare(b),
  );
}
