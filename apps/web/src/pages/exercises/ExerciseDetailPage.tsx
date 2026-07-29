import { addExerciseToToday } from "@xiaobai-amax/local-db";
import { ArrowLeft, Heart, PlusCircle } from "lucide-react";
import { useMemo } from "react";
import { navigate, navigateBack } from "../../app/router";
import { useExercises } from "../../shared/hooks/use-exercises";
import { useFavorites } from "../../shared/hooks/use-favorites";

type ExerciseDetailPageProps = {
  exerciseId: string;
};

export function ExerciseDetailPage({ exerciseId }: ExerciseDetailPageProps) {
  const { byId, loading } = useExercises();
  const { favoriteSet, toggle } = useFavorites();
  const exercise = byId.get(exerciseId);
  const steps = useMemo(() => exercise?.instructionSteps.zh ?? [], [exercise]);

  if (loading) {
    return <div className="page"><div className="empty-state">正在加载动作...</div></div>;
  }

  if (!exercise) {
    return <div className="page"><div className="empty-state">动作不存在</div></div>;
  }

  async function addToToday(targetExerciseId: string) {
    await addExerciseToToday(targetExerciseId);
    navigate("/workouts/new");
  }

  return (
    <div className="page detail-page">
      <header className="page-header compact">
        <button className="icon-button" onClick={() => navigateBack("/exercises")} type="button">
          <ArrowLeft size={20} />
        </button>
        <div className="title-block">
          <p className="eyebrow">{exercise.bodyPartZh} · {exercise.equipmentZh}</p>
          <h1>{exercise.displayName}</h1>
        </div>
        <button
          className={favoriteSet.has(exercise.id) ? "icon-button is-favorite" : "icon-button"}
          onClick={() => toggle(exercise.id)}
          type="button"
        >
          <Heart fill={favoriteSet.has(exercise.id) ? "currentColor" : "none"} size={20} />
        </button>
      </header>

      <section className="gif-stage">
        <img alt={exercise.displayName} src={exercise.gifUrl} />
        <p>{exercise.attribution}</p>
      </section>

      <section className="info-list">
        <div><span>目标肌群</span><strong>{exercise.targetZh ?? exercise.target}</strong></div>
        <div><span>协同肌群</span><strong>{exercise.secondaryMusclesZh.join("、") || "无"}</strong></div>
        <div><span>器械</span><strong>{exercise.equipmentZh}</strong></div>
        <div><span>部位</span><strong>{exercise.bodyPartZh}</strong></div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>动作步骤</h2>
        </div>
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={`${step}-${index}`}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="fixed-action">
        <button className="btn btn-primary" onClick={() => addToToday(exercise.id)} type="button">
          <PlusCircle size={18} />
          <span>加入今日训练</span>
        </button>
      </div>
    </div>
  );
}
