import type { WorkoutBundle } from "@xiaobai-amax/domain";
import { summarizeWorkout } from "@xiaobai-amax/domain";
import { deleteWorkout, getTodayWorkout, listRecentWorkoutBundles } from "@xiaobai-amax/data-client";
import { PlusCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { WorkoutSummaryCard } from "../../entities/workout/workout-summary-card";
import { useExercises } from "../../shared/hooks/use-exercises";
import { todayDate } from "../../shared/lib/dates";

export function RecordPage() {
  const { byId } = useExercises();
  const [todayBundle, setTodayBundle] = useState<WorkoutBundle | undefined>();
  const [recentBundles, setRecentBundles] = useState<WorkoutBundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingBundle, setDeletingBundle] = useState<WorkoutBundle | undefined>();

  const loadWorkouts = useCallback(async (mountGuard?: { current: boolean }) => {
    setIsLoading(true);
    const today = todayDate();
    const [todayWorkout, recent] = await Promise.all([
      getTodayWorkout(today),
      listRecentWorkoutBundles(3),
    ]);

    if (mountGuard && !mountGuard.current) return;
    setTodayBundle(todayWorkout);
    setRecentBundles(recent);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const mountGuard = { current: true };
    loadWorkouts(mountGuard);

    return () => {
      mountGuard.current = false;
    };
  }, [loadWorkouts]);

  const hasTodayWorkout = summarizeWorkout(todayBundle).exerciseCount > 0;

  function openTodayWorkout() {
    navigate(hasTodayWorkout && todayBundle ? `/workouts/${todayBundle.workout.id}/edit` : "/workouts/new");
  }

  async function confirmDeleteWorkout() {
    if (!deletingBundle) return;
    await deleteWorkout(deletingBundle.workout.id);
    setDeletingBundle(undefined);
    await loadWorkouts();
  }

  return (
    <div className="page record-page">
      <header className="page-header main-tab-header">
        <div>
          <p className="eyebrow">服务端自动保存</p>
          <h1>记录训练</h1>
        </div>
        <button className="text-action" disabled={isLoading} onClick={openTodayWorkout} type="button">
          {isLoading ? "加载中" : hasTodayWorkout ? "继续" : "新增"}
        </button>
      </header>

      <section className="section">
        <div className="section-title">
          <h2>最近训练</h2>
          <button className="section-link" onClick={() => navigate("/history")} type="button">
            更多 &gt;
          </button>
        </div>
        {isLoading ? (
          <div className="empty-state">正在加载训练记录...</div>
        ) : recentBundles.length ? (
          <div className="stack">
            {recentBundles.map((bundle) => (
              <WorkoutSummaryCard
                bundle={bundle}
                exerciseMap={byId}
                key={bundle.workout.id}
                onDelete={() => setDeletingBundle(bundle)}
                onOpen={() => navigate(`/workouts/${bundle.workout.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">还没有训练记录。点右上角新增，先记下今天这一练。</div>
        )}
      </section>

      {!isLoading && !recentBundles.length ? (
        <button className="btn btn-primary full-width record-empty-action" onClick={openTodayWorkout} type="button">
          <PlusCircle size={18} />
          <span>{hasTodayWorkout ? "继续记录" : "开始记录"}</span>
        </button>
      ) : null}

      {deletingBundle ? (
        <div className="confirm-backdrop" onClick={() => setDeletingBundle(undefined)}>
          <section className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon">
              <Trash2 size={20} />
            </div>
            <h2>删除这次训练？</h2>
            <p>将删除 {deletingBundle.workout.date} 的训练记录、动作和所有组数，此操作无法恢复。</p>
            <button className="btn btn-danger full-width" onClick={confirmDeleteWorkout} type="button">
              确认删除
            </button>
            <button className="btn btn-ghost full-width" onClick={() => setDeletingBundle(undefined)} type="button">
              取消
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
