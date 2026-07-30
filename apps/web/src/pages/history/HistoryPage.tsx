import type { WorkoutBundle } from "@xiaobai-amax/domain";
import { summarizeWorkout } from "@xiaobai-amax/domain";
import { listMonthWorkoutBundles } from "@xiaobai-amax/data-client";
import { formatVolume } from "@xiaobai-amax/utils";
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { WorkoutSummaryCard } from "../../entities/workout/workout-summary-card";
import { useExercises } from "../../shared/hooks/use-exercises";

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthInfo(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const dayCount = new Date(year, month, 0).getDate();

  return {
    dayCount,
    label: `${year}年${month}月`,
    monthKey,
  };
}

const HISTORY_START_YEAR = 2026;
const HISTORY_START_MONTH = import.meta.env.DEV ? 5 : 7;

function getHistoryStartDate() {
  return getMonthStart(new Date(HISTORY_START_YEAR, HISTORY_START_MONTH - 1, 1));
}

function getCurrentMonthDate() {
  return getMonthStart(new Date());
}

function clampMonthDate(date: Date) {
  const monthDate = getMonthStart(date);
  const startDate = getHistoryStartDate();
  const currentDate = getCurrentMonthDate();

  if (monthDate.getTime() < startDate.getTime()) {
    return startDate;
  }

  if (monthDate.getTime() > currentDate.getTime()) {
    return currentDate;
  }

  return monthDate;
}

function getAvailableMonths(year: number) {
  const currentDate = getCurrentMonthDate();
  const startMonth = year === HISTORY_START_YEAR ? HISTORY_START_MONTH : 1;
  const endMonth = year === currentDate.getFullYear() ? currentDate.getMonth() + 1 : 12;

  return Array.from(
    { length: Math.max(endMonth - startMonth + 1, 0) },
    (_, index) => startMonth + index,
  );
}

export function HistoryPage() {
  const { byId } = useExercises();
  const [bundles, setBundles] = useState<WorkoutBundle[]>([]);
  const [selectedMonthDate, setSelectedMonthDate] = useState(() => clampMonthDate(new Date()));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [monthControlsVisible, setMonthControlsVisible] = useState(false);
  const currentMonth = useMemo(() => getMonthInfo(getCurrentMonthDate()), []);
  const selectedMonth = useMemo(() => getMonthInfo(selectedMonthDate), [selectedMonthDate]);
  const isCurrentMonth = selectedMonth.monthKey === currentMonth.monthKey;

  const yearOptions = useMemo(() => {
    const currentYear = getCurrentMonthDate().getFullYear();
    const minYear = HISTORY_START_YEAR;
    const maxYear = currentYear;

    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
  }, []);

  const availableMonthOptions = useMemo(() => {
    return getAvailableMonths(selectedMonthDate.getFullYear());
  }, [selectedMonthDate]);

  const canGoPreviousMonth = selectedMonthDate.getTime() > getHistoryStartDate().getTime();
  const canGoNextMonth = selectedMonthDate.getTime() < getCurrentMonthDate().getTime();

  useEffect(() => {
    setSelectedMonthDate((date) => clampMonthDate(date));
  }, []);

  useEffect(() => {
    async function load() {
      setBundles(await listMonthWorkoutBundles(selectedMonth.monthKey));
    }

    load();
  }, [selectedMonth.monthKey]);

  useEffect(() => {
    setSelectedDates(new Set());
  }, [selectedMonth.monthKey]);

  const selectedMonthBundles = useMemo(() => {
    return bundles;
  }, [bundles, selectedMonth.monthKey]);

  const monthSummary = useMemo(() => {
    return selectedMonthBundles.reduce(
      (total, bundle) => {
        const summary = summarizeWorkout(bundle);
        total.workouts += 1;
        total.sets += summary.setCount;
        total.volume += summary.totalVolume;
        return total;
      },
      { workouts: 0, sets: 0, volume: 0 },
    );
  }, [selectedMonthBundles]);

  const displayedBundles = useMemo(() => {
    if (!selectedDates.size) {
      return selectedMonthBundles;
    }

    return selectedMonthBundles.filter((bundle) => selectedDates.has(bundle.workout.date));
  }, [selectedDates, selectedMonthBundles]);

  const trainingListTitle = selectedDates.size
    ? `已选 ${selectedDates.size} 天训练`
    : isCurrentMonth
      ? "本月训练"
      : "当月训练";

  function shiftMonth(offset: number) {
    setSelectedMonthDate((date) => {
      const nextDate = getMonthStart(new Date(date.getFullYear(), date.getMonth() + offset, 1));
      return clampMonthDate(nextDate);
    });
  }

  function selectYear(year: number) {
    setSelectedMonthDate((date) => {
      return clampMonthDate(new Date(Math.max(year, HISTORY_START_YEAR), date.getMonth(), 1));
    });
  }

  function selectMonth(month: number) {
    setSelectedMonthDate((date) => clampMonthDate(new Date(date.getFullYear(), month - 1, 1)));
  }

  function toggleDate(date: string) {
    setSelectedDates((dates) => {
      const nextDates = new Set(dates);

      if (nextDates.has(date)) {
        nextDates.delete(date);
      } else {
        nextDates.add(date);
      }

      return nextDates;
    });
  }

  return (
    <div className="page">
      <header className="page-header main-tab-header">
        <div>
          <p className="eyebrow">本地记录</p>
          <h1>训练历史</h1>
        </div>
        <button
          aria-expanded={monthControlsVisible}
          aria-label={monthControlsVisible ? "收起月份切换" : "展开月份切换"}
          className={monthControlsVisible ? "icon-button month-toggle is-active" : "icon-button month-toggle"}
          onClick={() => setMonthControlsVisible((visible) => !visible)}
          type="button"
        >
          <CalendarDays size={22} />
        </button>
      </header>

      <section className="summary-strip">
        <div><strong>{monthSummary.workouts}</strong><span>{isCurrentMonth ? "本月训练" : "当月训练"}</span></div>
        <div><strong>{monthSummary.sets}</strong><span>总组数</span></div>
        <div><strong>{formatVolume(monthSummary.volume)}</strong><span>总训练量</span></div>
      </section>

      <div className="calendar-month">
        <h2>{selectedMonth.label}</h2>
        <span>{isCurrentMonth ? "本月概览" : "月度概览"}</span>
      </div>

      {monthControlsVisible ? (
        <div className="month-controls" aria-label="月份切换">
          <div className="month-picker">
            <label>
              <span>年份</span>
              <select
                onChange={(event) => selectYear(Number(event.target.value))}
                value={selectedMonthDate.getFullYear()}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </label>
            <label>
              <span>月份</span>
              <select
                onChange={(event) => selectMonth(Number(event.target.value))}
                value={selectedMonthDate.getMonth() + 1}
              >
                {availableMonthOptions.map((month) => (
                  <option key={month} value={month}>{month}月</option>
                ))}
              </select>
            </label>
          </div>
          <div className="month-stepper">
            <button
              aria-label="上个月"
              disabled={!canGoPreviousMonth}
              onClick={() => shiftMonth(-1)}
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="month-reset"
              disabled={isCurrentMonth}
              onClick={() => setSelectedMonthDate(getCurrentMonthDate())}
              type="button"
            >
              <RotateCcw size={15} />
              <span>回到本月</span>
            </button>
            <button
              aria-label="下个月"
              disabled={!canGoNextMonth}
              onClick={() => shiftMonth(1)}
              type="button"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      ) : null}

      <section className="calendar-lite">
        {Array.from({ length: selectedMonth.dayCount }, (_, index) => {
          const day = String(index + 1).padStart(2, "0");
          const date = `${selectedMonth.monthKey}-${day}`;
          const hasWorkout = selectedMonthBundles.some((bundle) => {
            return bundle.workout.date === date;
          });
          const isSelected = selectedDates.has(date);
          const className = [
            hasWorkout ? "has-workout" : "",
            isSelected ? "is-selected" : "",
          ].filter(Boolean).join(" ");

          return (
            <button
              aria-label={`${selectedMonth.label}${index + 1}日${hasWorkout ? "，有训练记录" : "，无训练记录"}`}
              aria-pressed={isSelected}
              className={className}
              key={day}
              onClick={() => toggleDate(date)}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </section>

      <section className="section">
        <div className="section-title"><h2>{trainingListTitle}</h2></div>
        {displayedBundles.length ? (
          <div className="stack">
            {displayedBundles.map((bundle) => (
              <WorkoutSummaryCard
                bundle={bundle}
                exerciseMap={byId}
                key={bundle.workout.id}
                onOpen={() => navigate(`/workouts/${bundle.workout.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {selectedDates.size ? "所选日期还没有训练记录。" : "这个月还没有训练记录。"}
          </div>
        )}
      </section>
    </div>
  );
}
