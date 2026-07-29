import { useMemo } from "react";
import { navigate } from "../../app/router";
import { ExerciseCard } from "../../entities/exercise/exercise-card";
import { useExercises } from "../../shared/hooks/use-exercises";
import { useFavorites } from "../../shared/hooks/use-favorites";

export function FavoritesPage() {
  const { exercises, loading, error } = useExercises();
  const { favoriteIds, favoriteSet, toggle } = useFavorites();

  const favoriteExercises = useMemo(() => {
    return exercises.filter((exercise) => favoriteSet.has(exercise.id));
  }, [exercises, favoriteSet]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{favoriteIds.length.toLocaleString("zh-CN")} 个收藏</p>
          <h1>我的收藏</h1>
        </div>
      </header>

      {loading ? <div className="empty-state">正在加载收藏动作...</div> : null}
      {error ? <div className="empty-state">{error}</div> : null}
      {!loading && !favoriteExercises.length ? (
        <div className="empty-state">
          <p>还没有收藏动作。点一下动作卡片右上角的爱心，这里就会显示它们。</p>
          <button className="btn btn-secondary full-width" onClick={() => navigate("/exercises")} type="button">
            去动作库
          </button>
        </div>
      ) : null}

      <section className="exercise-grid">
        {favoriteExercises.map((exercise) => (
          <ExerciseCard
            exercise={exercise}
            favorite
            key={exercise.id}
            onOpen={() => navigate(`/exercises/${exercise.id}`)}
            onToggleFavorite={() => toggle(exercise.id)}
          />
        ))}
      </section>
    </div>
  );
}
