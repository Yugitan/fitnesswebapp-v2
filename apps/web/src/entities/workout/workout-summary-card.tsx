import { summarizeWorkout, type ExerciseView, type WorkoutBundle } from "@xiaobai-amax/domain";
import { formatVolume } from "@xiaobai-amax/utils";
import { Trash2 } from "lucide-react";
import { formatDate } from "../../shared/lib/dates";

type WorkoutSummaryCardProps = {
  bundle: WorkoutBundle;
  exerciseMap: Map<string, ExerciseView>;
  onOpen?: () => void;
  onDelete?: () => void;
};

export function WorkoutSummaryCard({ bundle, exerciseMap, onOpen, onDelete }: WorkoutSummaryCardProps) {
  const summary = summarizeWorkout(bundle);
  const bodyParts = Array.from(
    new Set(
      bundle.exercises
        .map((item) => exerciseMap.get(item.workoutExercise.exerciseId)?.bodyPartZh)
        .filter(Boolean),
    ),
  ).slice(0, 3);

  return (
    <article className="workout-card">
      <button className="workout-card-main" onClick={onOpen} type="button">
        <div>
          <p className="eyebrow">{formatDate(bundle.workout.date)}</p>
          <h3>{summary.exerciseCount} 个动作</h3>
        </div>
        <div className="workout-card-stats">
          <span>{summary.setCount} 组</span>
          <span>{formatVolume(summary.totalVolume)}</span>
        </div>
        <div className="tag-row">
          {bodyParts.length ? bodyParts.map((part) => <span className="tag" key={part}>{part}</span>) : <span className="tag tag-muted">未添加动作</span>}
        </div>
      </button>
      {onDelete ? (
        <button className="workout-card-delete" onClick={onDelete} type="button" aria-label="删除训练记录">
          <Trash2 size={18} />
        </button>
      ) : null}
    </article>
  );
}
