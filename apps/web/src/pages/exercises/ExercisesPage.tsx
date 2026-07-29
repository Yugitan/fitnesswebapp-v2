import { filterExercises } from "@xiaobai-amax/domain";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { ExerciseCard } from "../../entities/exercise/exercise-card";
import { useExercises } from "../../shared/hooks/use-exercises";
import { useFavorites } from "../../shared/hooks/use-favorites";

const FAVORITES_FILTER = "favorites";

const bodyPartFilters = [
  ["all", "全部"],
  [FAVORITES_FILTER, "收藏"],
  ["chest", "胸部"],
  ["back", "背部"],
  ["upper legs", "腿部"],
  ["shoulders", "肩部"],
  ["upper arms", "手臂"],
  ["waist", "核心"],
  ["cardio", "有氧"],
];

const equipmentFilters = [
  ["all", "全部器械"],
  ["body weight", "自重"],
  ["dumbbell", "哑铃"],
  ["barbell", "杠铃"],
  ["cable", "绳索"],
  ["kettlebell", "壶铃"],
  ["leverage machine", "固定器械"],
];

export function ExercisesPage() {
  const { exercises, loading, error } = useExercises();
  const { favoriteSet, toggle } = useFavorites();
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const hasActiveFilters = bodyPart !== "all" || equipment !== "all";

  const results = useMemo(() => {
    const filtered = filterExercises(exercises, {
      query,
      bodyPart: bodyPart === FAVORITES_FILTER ? "all" : bodyPart,
      equipment,
    });

    const prioritized = filtered.filter((exercise) => {
      return bodyPart !== FAVORITES_FILTER || favoriteSet.has(exercise.id);
    });

    return prioritized.slice(0, 80);
  }, [bodyPart, equipment, exercises, favoriteSet, query]);

  const emptyMessage =
    bodyPart === FAVORITES_FILTER
      ? "还没有收藏动作。点一下动作卡片右上角的爱心，这里就会显示它们。"
      : "没有找到相关动作，试试“卧推”“深蹲”“卷腹”。";

  return (
    <div className="page">
      <div className="sticky-search">
        <header className="page-header compact">
          <div>
            <p className="eyebrow">{exercises.length.toLocaleString("zh-CN")} 个动作</p>
            <h1>动作库</h1>
          </div>
          <button
            aria-expanded={filtersVisible}
            aria-label={filtersVisible ? "收起筛选" : "展开筛选"}
            className={filtersVisible || hasActiveFilters ? "icon-button filter-toggle is-active" : "icon-button filter-toggle"}
            onClick={() => setFiltersVisible((visible) => !visible)}
            type="button"
          >
            <SlidersHorizontal size={22} />
          </button>
        </header>
        <label className="search-box">
          <Search size={18} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索动作、部位或器械"
            value={query}
          />
        </label>
        {filtersVisible ? (
          <div className="filter-panel">
            <div className="filter-row" aria-label="动作范围和部位筛选">
              {bodyPartFilters.map(([value, label]) => (
                <button
                  className={bodyPart === value ? "chip is-active" : "chip"}
                  key={value}
                  onClick={() => setBodyPart(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="filter-row" aria-label="器械筛选">
              {equipmentFilters.map(([value, label]) => (
                <button
                  className={equipment === value ? "chip is-active" : "chip"}
                  key={value}
                  onClick={() => setEquipment(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="empty-state">正在加载动作库...</div> : null}
      {error ? <div className="empty-state">{error}</div> : null}
      {!loading && !results.length ? (
        <div className="empty-state">{emptyMessage}</div>
      ) : null}

      <section className="exercise-grid">
        {results.map((exercise) => (
          <ExerciseCard
            exercise={exercise}
            favorite={favoriteSet.has(exercise.id)}
            key={exercise.id}
            onOpen={() => navigate(`/exercises/${exercise.id}`)}
            onToggleFavorite={() => toggle(exercise.id)}
          />
        ))}
      </section>
    </div>
  );
}
