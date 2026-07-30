import type { WorkoutBundle } from "@xiaobai-amax/domain";
import { summarizeWorkout } from "@xiaobai-amax/domain";
import type { AuthUser } from "@xiaobai-amax/data-client";
import { getExerciseBodyParts, listWorkoutBundlesSince } from "@xiaobai-amax/data-client";
import { bodyPartZh } from "@xiaobai-amax/exercise-data";
import { formatVolume } from "@xiaobai-amax/utils";
import { ArrowRight, BarChart3, Dumbbell, LockKeyhole, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { openAuthDialog } from "../../shared/lib/auth-dialog";

type Period = 28 | 84;

const muscleGroups = ["胸部", "背部", "下肢", "核心"] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodStart(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return dateKey(date);
}

function weekKey(date: string) {
  const value = new Date(`${date}T00:00:00`);
  const offset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - offset);
  return dateKey(value);
}

function buildWeekKeys(weeks: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  return Array.from({ length: weeks }, (_, index) => {
    const value = new Date(now);
    value.setDate(value.getDate() - (weeks - index - 1) * 7);
    return dateKey(value);
  });
}

function changeLabel(current: number, previous: number) {
  if (!previous) return current ? "刚刚开始积累" : "等待第一组数据";
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function recommendation(muscles: Record<(typeof muscleGroups)[number], number>) {
  const entries = muscleGroups.map((name) => [name, muscles[name]] as const);
  const [leastName, leastSets] = entries.reduce((lowest, item) => item[1] < lowest[1] ? item : lowest);
  const highestSets = Math.max(...entries.map(([, sets]) => sets));

  if (leastSets === highestSets) {
    return "本期肌群训练分布均衡，按当前节奏继续即可。";
  }

  const suggestedSets = Math.max(2, Math.min(6, highestSets - leastSets));
  return `下次优先安排${leastName}训练，建议补 ${suggestedSets}–${suggestedSets + 2} 组。`;
}

type AnalysisPageProps = {
  user: AuthUser | null;
  authLoading: boolean;
};

export function AnalysisPage({ user, authLoading }: AnalysisPageProps) {
  const [period, setPeriod] = useState<Period>(28);
  const [bundles, setBundles] = useState<WorkoutBundle[]>([]);
  const [bodyParts, setBodyParts] = useState<Record<string, string>>({});
  const [bodyPartsLoading, setBodyPartsLoading] = useState(false);
  const [readyToLoad, setReadyToLoad] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setReadyToLoad(true));
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    if (!readyToLoad || authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    listWorkoutBundlesSince(periodStart(168))
      .then((items) => {
        if (mounted) {
          setBundles(items.filter((bundle) => summarizeWorkout(bundle).setCount > 0));
          setError(false);
        }
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [authLoading, readyToLoad, user]);

  const exerciseIds = useMemo(() => Array.from(new Set(
    bundles.flatMap((bundle) => bundle.exercises.map((item) => item.workoutExercise.exerciseId)),
  )), [bundles]);

  useEffect(() => {
    if (!exerciseIds.length) {
      setBodyParts({});
      setBodyPartsLoading(false);
      return;
    }

    let mounted = true;
    setBodyPartsLoading(true);
    getExerciseBodyParts(exerciseIds)
      .then((items) => {
        if (mounted) setBodyParts(items);
      })
      .catch(() => {
        if (mounted) setBodyParts({});
      })
      .finally(() => {
        if (mounted) setBodyPartsLoading(false);
      });

    return () => { mounted = false; };
  }, [exerciseIds]);

  const analytics = useMemo(() => {
    const start = periodStart(period);
    const previousStart = periodStart(period * 2);
    const current = bundles.filter((bundle) => bundle.workout.date >= start);
    const previous = bundles.filter((bundle) => bundle.workout.date >= previousStart && bundle.workout.date < start);
    const totalVolume = current.reduce((total, bundle) => total + summarizeWorkout(bundle).totalVolume, 0);
    const previousVolume = previous.reduce((total, bundle) => total + summarizeWorkout(bundle).totalVolume, 0);
    const totalSets = current.reduce((total, bundle) => total + summarizeWorkout(bundle).setCount, 0);
    const weeks = buildWeekKeys(period / 7).map((key) => ({ key, volume: 0 }));
    const byWeek = new Map(weeks.map((item) => [item.key, item]));
    const muscles: Record<(typeof muscleGroups)[number], number> = { 胸部: 0, 背部: 0, 下肢: 0, 核心: 0 };

    current.forEach((bundle) => {
      const week = byWeek.get(weekKey(bundle.workout.date));
      if (week) week.volume += summarizeWorkout(bundle).totalVolume;
      bundle.exercises.forEach(({ workoutExercise, sets }) => {
        const bodyPart = bodyPartZh[bodyParts[workoutExercise.exerciseId]];
        const group = bodyPart === "腿部" || bodyPart === "小腿" ? "下肢" : bodyPart;
        if (group && group in muscles) muscles[group as keyof typeof muscles] += sets.length;
      });
    });

    const activeWeeks = weeks.filter((week) => week.volume > 0).length;
    return {
      activeWeeks,
      change: changeLabel(totalVolume, previousVolume),
      current,
      muscles,
      recommendation: recommendation(muscles),
      totalSets,
      totalVolume,
      weeks,
    };
  }, [bodyParts, bundles, period]);

  if (!authLoading && !user) {
    return <AnalysisAccessState />;
  }

  if (loading) {
    return <AnalysisLoading />;
  }

  if (error) {
    return (
      <div className="page analysis-page">
        <header className="page-header main-tab-header"><div><p className="eyebrow">个人训练报告</p><h1>运动分析</h1></div></header>
        <div className="analysis-loading">暂时无法加载分析数据，请稍后再试。</div>
      </div>
    );
  }

  if (bundles.length < 3) {
    return <AnalysisEmptyState completed={bundles.length} />;
  }

  const maxVolume = Math.max(...analytics.weeks.map((week) => week.volume), 1);
  const maxMuscleSets = Math.max(...muscleGroups.map((group) => analytics.muscles[group]), 1);

  return (
    <div className="page analysis-page">
      <header className="page-header main-tab-header">
        <div><p className="eyebrow">个人训练报告</p><h1>运动分析</h1></div>
        <span className="analysis-period-note">最近 {period} 天</span>
      </header>

      <div className="analysis-periods" aria-label="分析周期">
        <button className={period === 28 ? "is-active" : ""} onClick={() => setPeriod(28)} type="button">4周</button>
        <button className={period === 84 ? "is-active" : ""} onClick={() => setPeriod(84)} type="button">12周</button>
      </div>

      <section className="analysis-hero">
        <span>本期状态</span>
        <h2>{analytics.current.length >= 8 ? "节奏很稳，继续保持" : "稳定积累，正在进步"}</h2>
        <p>{analytics.current.length} 次训练 · 训练量较上期 {analytics.change}</p>
        <div className="analysis-hero-stats">
          <div><strong>{analytics.current.length}</strong><small>训练次数</small></div>
          <div><strong>{formatVolume(analytics.totalVolume)}</strong><small>总训练量</small></div>
          <div><strong>{analytics.activeWeeks}</strong><small>活跃周数</small></div>
        </div>
      </section>

      <section className="analysis-card">
        <div className="analysis-card-heading"><h2>训练量趋势</h2><span>{analytics.change}</span></div>
        <div className="volume-chart" aria-label={`最近 ${period / 7} 周训练量趋势`} style={{ gridTemplateColumns: `repeat(${analytics.weeks.length}, minmax(0, 1fr))` }}>
          {analytics.weeks.map((week, index) => (
            <div className="volume-column" key={week.key}>
              <span className="volume-value">{week.volume ? formatVolume(week.volume) : ""}</span>
              <div className="volume-track"><i style={{ height: `${Math.max(week.volume ? (week.volume / maxVolume) * 100 : 0, 4)}%` }} /></div>
              <small>{period === 28 ? `W${index + 1}` : `${new Date(`${week.key}T00:00:00`).getMonth() + 1}/${new Date(`${week.key}T00:00:00`).getDate()}`}</small>
            </div>
          ))}
        </div>
        <div className="analysis-card-footer"><span>{analytics.totalSets} 组训练</span><button onClick={() => navigate("/history")} type="button">查看训练记录 <ArrowRight size={14} /></button></div>
      </section>

      <section className="analysis-card">
        <div className="analysis-card-heading"><h2>肌群平衡</h2><span>按训练组数</span></div>
        <div className="muscle-bars">
          {muscleGroups.map((group) => {
            const sets = analytics.muscles[group];
            return <div className="muscle-row" key={group}><span>{group}</span><div><i style={{ width: `${(sets / maxMuscleSets) * 100}%` }} /></div><strong>{sets} 组</strong></div>;
          })}
        </div>
        <p className="analysis-tip"><TrendingUp size={16} />{bodyPartsLoading ? "正在匹配已训练动作的肌群…" : analytics.recommendation}</p>
      </section>

      <section className="analysis-next">
        <div className="analysis-next-icon"><Dumbbell size={19} /></div>
        <div><span>下一次训练建议</span><h2>{bodyPartsLoading ? "正在生成肌群建议…" : analytics.recommendation}</h2></div>
        <button aria-label="去记录训练" onClick={() => navigate("/workouts/new?returnTo=record")} type="button"><ArrowRight size={18} /></button>
      </section>
    </div>
  );
}

function AnalysisLoading() {
  return (
    <div className="page analysis-page">
      <header className="page-header main-tab-header"><div><p className="eyebrow">个人训练报告</p><h1>运动分析</h1></div></header>
      <section className="analysis-skeleton" aria-label="正在加载运动分析">
        <i /><i /><i />
      </section>
    </div>
  );
}

function AnalysisAccessState() {
  return (
    <div className="page analysis-page">
      <header className="page-header main-tab-header"><div><p className="eyebrow">个人训练报告</p><h1>运动分析</h1></div></header>
      <section className="analysis-access">
        <span className="analysis-access-icon"><LockKeyhole size={24} /></span>
        <h2>登录后解锁分析</h2>
        <p>登录账号后，我们会将训练记录整理为趋势、肌群平衡和下一次训练建议。</p>
        <button className="btn btn-primary full-width" onClick={openAuthDialog} type="button">登录并查看分析</button>
      </section>
    </div>
  );
}

function AnalysisEmptyState({ completed }: { completed: number }) {
  const remaining = Math.max(3 - completed, 0);
  return (
    <div className="page analysis-page">
      <header className="page-header main-tab-header"><div><p className="eyebrow">个人训练报告</p><h1>运动分析</h1></div></header>
      <section className="analysis-unlock-card">
        <span>分析已开启</span>
        <h2>先完成 3 次训练</h2>
        <p>还差 {remaining} 次，即可生成首份运动分析。</p>
        <div className="unlock-progress" aria-label={`已完成 ${completed} / 3 次训练`}>
          {[0, 1, 2].map((index) => <i className={index < completed ? "is-complete" : ""} key={index} />)}
        </div>
      </section>
      <section className="analysis-empty-intro">
        <span className="analysis-empty-icon"><BarChart3 size={38} /></span>
        <h2>让每一组都有意义</h2>
        <p>记录训练后，我们会帮你看见训练量、肌群平衡和恢复节奏。</p>
      </section>
      <section className="analysis-locked-list">
        <p><LockKeyhole size={15} />看训练量趋势</p>
        <p><LockKeyhole size={15} />发现肌群失衡</p>
        <p><LockKeyhole size={15} />获得下一次训练建议</p>
      </section>
      <button className="btn btn-primary full-width analysis-record-action" onClick={() => navigate("/workouts/new?returnTo=record")} type="button">去记录第一次训练</button>
      <button className="analysis-library-action" onClick={() => navigate("/exercises")} type="button">先浏览动作库</button>
    </div>
  );
}
