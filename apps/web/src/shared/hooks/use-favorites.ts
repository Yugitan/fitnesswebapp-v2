import {
  listFavoriteExerciseIds,
  toggleFavoriteExercise,
} from "@xiaobai-amax/local-db";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const refresh = useCallback(() => {
    listFavoriteExerciseIds().then(setFavoriteIds);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (exerciseId: string) => {
      await toggleFavoriteExercise(exerciseId);
      refresh();
    },
    [refresh],
  );

  return {
    favoriteIds,
    favoriteSet,
    toggle,
    refresh,
  };
}
