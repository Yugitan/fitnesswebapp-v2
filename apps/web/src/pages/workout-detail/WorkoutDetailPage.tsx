import { summarizeWorkout, type WorkoutBundle } from "@xiaobai-amax/domain";
import { getWorkoutBundle } from "@xiaobai-amax/local-db";
import { formatVolume } from "@xiaobai-amax/utils";
import { ArrowLeft, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { navigate, navigateBack } from "../../app/router";
import { useExercises } from "../../shared/hooks/use-exercises";
import { formatDate } from "../../shared/lib/dates";

type WorkoutDetailPageProps = {
  workoutId: string;
};

export function WorkoutDetailPage({ workoutId }: WorkoutDetailPageProps) {
  const { byId } = useExercises();
  const [bundle, setBundle] = useState<WorkoutBundle | undefined>();

  useEffect(() => {
    getWorkoutBundle(workoutId).then(setBundle);
  }, [workoutId]);

  if (!bundle) {
    return <div className="page"><div className="empty-state">正在加载训练记录...</div></div>;
  }

  const summary = summarizeWorkout(bundle);

  return (
    <div className="page">
      <header className="page-header compact">
        <button className="icon-button" onClick={() => navigateBack("/history")} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">{formatDate(bundle.workout.date)}</p>
          <h1>训练详情</h1>
        </div>
        <button className="icon-button" onClick={() => navigate(`/workouts/${bundle.workout.id}/edit`)} type="button">
          <Pencil size={18} />
        </button>
      </header>

      <section className="summary-strip">
        <div><strong>{summary.exerciseCount}</strong><span>动作</span></div>
        <div><strong>{summary.setCount}</strong><span>组</span></div>
        <div><strong>{formatVolume(summary.totalVolume)}</strong><span>训练量</span></div>
      </section>

      <section className="stack">
        {bundle.exercises.map((item) => {
          const exercise = byId.get(item.workoutExercise.exerciseId);

          return (
            <article className="workout-exercise" key={item.workoutExercise.id}>
              <div className="workout-exercise-header">
                {exercise ? <img alt={exercise.displayName} src={exercise.imageUrl} /> : null}
                <div>
                  <h2>{exercise?.displayName ?? item.workoutExercise.exerciseId}</h2>
                  <p>{exercise ? `${exercise.bodyPartZh} · ${exercise.equipmentZh}` : "动作数据缺失"}</p>
                </div>
              </div>
              <div className="readonly-sets">
                {item.sets.map((set) => (
                  <div key={set.id}>
                    <span>第 {set.setNumber} 组</span>
                    <strong>{set.weightKg ?? 0} kg × {set.reps ?? 0}</strong>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      {bundle.workout.notes ? (
        <section className="note-panel">
          <h2>备注</h2>
          <p>{bundle.workout.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
