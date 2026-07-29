import type { ExerciseView } from "@xiaobai-amax/domain";
import { Heart } from "lucide-react";

type ExerciseCardProps = {
  exercise: ExerciseView;
  favorite?: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
};

export function ExerciseCard({
  exercise,
  favorite = false,
  onOpen,
  onToggleFavorite,
}: ExerciseCardProps) {
  return (
    <article className="exercise-card">
      <button className="exercise-card-media" onClick={onOpen} type="button">
        <img alt={exercise.displayName} loading="lazy" src={exercise.imageUrl} />
      </button>
      <div className="exercise-card-body">
        <button className="text-button exercise-card-title" onClick={onOpen} type="button">
          {exercise.displayName}
        </button>
        <div className="tag-row">
          <span className="tag">{exercise.bodyPartZh}</span>
          <span className="tag tag-muted">{exercise.equipmentZh}</span>
        </div>
      </div>
      <button
        aria-label={favorite ? "取消收藏" : "收藏动作"}
        className={favorite ? "icon-button is-favorite" : "icon-button"}
        onClick={onToggleFavorite}
        type="button"
      >
        <Heart size={18} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
