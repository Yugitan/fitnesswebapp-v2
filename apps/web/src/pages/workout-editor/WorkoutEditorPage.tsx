import type { ExerciseView, TrainingSet, WorkoutBundle } from "@xiaobai-amax/domain";
import { filterExercises, summarizeWorkout } from "@xiaobai-amax/domain";
import {
  addExerciseToWorkout,
  addSet,
  deleteSet,
  deleteWorkoutExercise,
  getOrCreateWorkout,
  getWorkoutBundle,
  updateSet,
  updateWorkoutNotes,
} from "@xiaobai-amax/local-db";
import { formatVolume } from "@xiaobai-amax/utils";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navigate, navigateBack } from "../../app/router";
import { useExercises } from "../../shared/hooks/use-exercises";
import { todayDate } from "../../shared/lib/dates";

type WorkoutEditorPageProps = {
  workoutId?: string;
};

export function WorkoutEditorPage({ workoutId }: WorkoutEditorPageProps) {
  const { exercises, byId } = useExercises();
  const [date, setDate] = useState(todayDate());
  const [bundle, setBundle] = useState<WorkoutBundle | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const returnToRecord = new URLSearchParams(window.location.search).get("returnTo") === "record";

  async function refresh(targetDate = date) {
    if (workoutId) {
      const existing = await getWorkoutBundle(workoutId);
      setBundle(existing);
      if (existing) {
        setDate(existing.workout.date);
      }
      return;
    }

    const workout = await getOrCreateWorkout(targetDate);
    setBundle(await getWorkoutBundle(workout.id));
  }

  useEffect(() => {
    refresh(date);
  }, [date, workoutId]);

  const summary = summarizeWorkout(bundle);
  const pickerResults = useMemo(
    () => filterExercises(exercises, { query, bodyPart: "all", equipment: "all" }).slice(0, 30),
    [exercises, query],
  );

  async function addExercise(exercise: ExerciseView) {
    if (!bundle) return;
    await addExerciseToWorkout(bundle.workout.id, exercise.id);
    setPickerOpen(false);
    setQuery("");
    refresh();
  }

  async function updateTrainingSet(set: TrainingSet, patch: Partial<TrainingSet>) {
    if (!bundle) return;
    await updateSet(bundle.workout.id, { ...set, ...patch });
    refresh();
  }

  return (
    <div className="page editor-page">
      <header className="page-header compact">
        <button className="icon-button" onClick={() => navigateBack("/record")} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">本地自动保存</p>
          <h1>记录训练</h1>
        </div>
        <button
          className="text-action"
          onClick={() => {
            if (returnToRecord) {
              navigate("/record");
              return;
            }

            navigateBack(bundle ? `/workouts/${bundle.workout.id}` : "/record");
          }}
          type="button"
        >
          完成
        </button>
      </header>

      <label className="field">
        <span>训练日期</span>
        <input
          disabled={Boolean(workoutId)}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
      </label>

      <section className="summary-strip">
        <div><strong>{summary.exerciseCount}</strong><span>动作</span></div>
        <div><strong>{summary.setCount}</strong><span>组</span></div>
        <div><strong>{formatVolume(summary.totalVolume)}</strong><span>训练量</span></div>
      </section>

      <section className="stack">
        {bundle?.exercises.map((item) => {
          const exercise = byId.get(item.workoutExercise.exerciseId);

          return (
            <article className="workout-exercise" key={item.workoutExercise.id}>
              <div className="workout-exercise-header">
                {exercise ? <img alt={exercise.displayName} src={exercise.imageUrl} /> : null}
                <div>
                  <h2>{exercise?.displayName ?? item.workoutExercise.exerciseId}</h2>
                  <p>{exercise ? `${exercise.bodyPartZh} · ${exercise.equipmentZh}` : "动作数据缺失"}</p>
                </div>
                <button
                  className="icon-button"
                  onClick={async () => {
                    await deleteWorkoutExercise(bundle.workout.id, item.workoutExercise.id);
                    refresh();
                  }}
                  type="button"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="set-table">
                <div className="set-row set-row-head">
                  <span>组</span>
                  <span>重量 kg</span>
                  <span>次数</span>
                  <span></span>
                </div>
                {item.sets.map((set) => (
                  <div className="set-row" key={set.id}>
                    <span>{set.setNumber}</span>
                    <input
                      inputMode="decimal"
                      onChange={(event) =>
                        updateTrainingSet(set, {
                          weightKg: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                      placeholder="0"
                      type="number"
                      value={set.weightKg ?? ""}
                    />
                    <input
                      inputMode="numeric"
                      onChange={(event) =>
                        updateTrainingSet(set, {
                          reps: event.target.value ? Number(event.target.value) : undefined,
                        })
                      }
                      placeholder="10"
                      type="number"
                      value={set.reps ?? ""}
                    />
                    <div className="row-actions">
                      <button
                        onClick={async () => {
                          await deleteSet(bundle.workout.id, set.id);
                          refresh();
                        }}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="btn btn-secondary full-width"
                onClick={async () => {
                  await addSet(bundle.workout.id, item.workoutExercise.id);
                  refresh();
                }}
                type="button"
              >
                <Plus size={18} />
                <span>添加一组</span>
              </button>
            </article>
          );
        })}
      </section>

      {bundle?.exercises.length === 0 ? (
        <div className="empty-state">先添加一个动作，训练记录就从这里开始。</div>
      ) : null}

      <button className="add-exercise-button" onClick={() => setPickerOpen(true)} type="button">
        <Plus size={20} />
        <span>添加动作</span>
      </button>

      <label className="field">
        <span>训练备注</span>
        <textarea
          onBlur={(event) => bundle && updateWorkoutNotes(bundle.workout.id, event.target.value)}
          placeholder="状态、感受、器械占用情况..."
          defaultValue={bundle?.workout.notes ?? ""}
        />
      </label>

      {pickerOpen ? (
        <div className="drawer-backdrop" onClick={() => setPickerOpen(false)}>
          <section className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-handle" />
            <h2>添加动作</h2>
            <label className="search-box">
              <Search size={18} />
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索动作"
                value={query}
              />
            </label>
            <div className="picker-list">
              {pickerResults.map((exercise) => (
                <button key={exercise.id} onClick={() => addExercise(exercise)} type="button">
                  <img alt={exercise.displayName} src={exercise.imageUrl} />
                  <span>{exercise.displayName}</span>
                  <small>{exercise.bodyPartZh} · {exercise.equipmentZh}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
