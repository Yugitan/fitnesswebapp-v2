import type { ExerciseView } from "@xiaobai-amax/domain";
import { loadExercises } from "@xiaobai-amax/exercise-data";
import { useEffect, useMemo, useState } from "react";

export function useExercises() {
  const [exercises, setExercises] = useState<ExerciseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    loadExercises()
      .then((items) => {
        if (mounted) {
          setExercises(items);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : "动作数据加载失败");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);

  return {
    exercises,
    byId,
    loading,
    error,
  };
}
