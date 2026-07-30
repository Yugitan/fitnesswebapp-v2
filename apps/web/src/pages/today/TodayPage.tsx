import { summarizeWorkout } from "@xiaobai-amax/domain";
import { getTodayWorkout, listRecentWorkoutBundles } from "@xiaobai-amax/data-client";
import { formatVolume } from "@xiaobai-amax/utils";
import { Heart, History, Library, PlusCircle, Search, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { WorkoutSummaryCard } from "../../entities/workout/workout-summary-card";
import { useExercises } from "../../shared/hooks/use-exercises";
import { formatDate, todayDate } from "../../shared/lib/dates";
import { navigate } from "../../app/router";
import type { WorkoutBundle } from "@xiaobai-amax/domain";

export function TodayPage() {
  const { byId } = useExercises();
  const [todayBundle, setTodayBundle] = useState<WorkoutBundle | undefined>();
  const [recentBundles, setRecentBundles] = useState<WorkoutBundle[]>([]);

  useEffect(() => {
    async function load() {
      const [today, recent] = await Promise.all([
        getTodayWorkout(todayDate()),
        listRecentWorkoutBundles(3),
      ]);

      setTodayBundle(today);
      setRecentBundles(recent);
    }

    load();
  }, []);

  const summary = summarizeWorkout(todayBundle);

  return (
    <div className="page">
      <header className="page-header main-tab-header">
        <div>
          <p className="eyebrow">小白Amax · 云端记录</p>
          <h1>今日训练</h1>
        </div>
        <button className="icon-button" onClick={() => navigate("/settings")} type="button">
          <Settings size={20} />
        </button>
      </header>

      <section className="hero-panel">
        <p>{formatDate(todayDate())}</p>
        <h2>{summary.exerciseCount > 0 ? "今天已经开练了" : "今天还没记录训练"}</h2>
        <div className="hero-stats">
          <span>{summary.exerciseCount} 动作</span>
          <span>{summary.setCount} 组</span>
          <span>{formatVolume(summary.totalVolume)}</span>
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => navigate("/workouts/new?returnTo=record")} type="button">
            <PlusCircle size={18} />
            <span>开始记录</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/exercises")} type="button">
            <Library size={18} />
            <span>浏览动作库</span>
          </button>
        </div>
      </section>

      <section className="quick-grid">
        <button onClick={() => navigate("/exercises")} type="button">
          <Search size={22} />
          <span>搜动作</span>
        </button>
        <button onClick={() => navigate("/favorites")} type="button">
          <Heart size={22} fill="none" />
          <span>看收藏</span>
        </button>
        <button onClick={() => navigate("/history")} type="button">
          <History size={22} />
          <span>看历史</span>
        </button>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>最近训练</h2>
          <button className="section-link" onClick={() => navigate("/history")} type="button">
            更多 &gt;
          </button>
        </div>
        {recentBundles.length ? (
          <div className="stack">
            {recentBundles.map((bundle) => (
              <WorkoutSummaryCard
                bundle={bundle}
                exerciseMap={byId}
                key={bundle.workout.id}
                onOpen={() => navigate(`/workouts/${bundle.workout.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">还没有训练记录，先完成一次训练闭环。</div>
        )}
      </section>
    </div>
  );
}
