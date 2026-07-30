import type { ExerciseView, TrainingSet, WorkoutBundle } from "@xiaobai-amax/domain";
import { filterExercises, summarizeWorkout } from "@xiaobai-amax/domain";
import {
  addSet,
  commitWorkout,
  createTrainingTemplate,
  deleteSet,
  deleteWorkoutExercise,
  getWorkoutBundle,
  getWorkoutBundleByDate,
  listTrainingTemplates,
  type TrainingTemplate,
  updateSet,
  type DraftExerciseInput,
} from "@xiaobai-amax/data-client";
import { createUuid, formatVolume } from "@xiaobai-amax/utils";
import { ArrowLeft, BookmarkPlus, LockKeyhole, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { navigate, navigateBack } from "../../app/router";
import { WorkoutCompletionPrompt } from "../../shared/components/WorkoutCompletionPrompt";
import { useAuth } from "../../shared/hooks/use-auth";
import { useExercises } from "../../shared/hooks/use-exercises";
import { dismissAuthPrompt, openAuthDialog } from "../../shared/lib/auth-dialog";
import { todayDate } from "../../shared/lib/dates";

type WorkoutEditorPageProps = {
  workoutId?: string;
};

type DraftExercise = {
  id: string;
  exerciseId: string;
  source: "manual" | "template";
  sets: DraftSet[];
};

type DraftSet = {
  id: string;
  weightKg?: number;
  reps?: number;
};

function createDraftSet(previous?: DraftSet): DraftSet {
  return { id: `draft_set_${createUuid()}`, weightKg: previous?.weightKg, reps: previous?.reps ?? 10 };
}

function createDraftExercise(exerciseId: string, source: DraftExercise["source"]): DraftExercise {
  return { id: `draft_${createUuid()}`, exerciseId, source, sets: [createDraftSet()] };
}

export function WorkoutEditorPage({ workoutId }: WorkoutEditorPageProps) {
  const { exercises, byId } = useExercises();
  const { user, loading: authLoading } = useAuth();
  const [date, setDate] = useState(todayDate());
  const [bundle, setBundle] = useState<WorkoutBundle | undefined>();
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [completionPromptOpen, setCompletionPromptOpen] = useState(false);
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TrainingTemplate>();
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSaveError, setTemplateSaveError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const returnToRecord = new URLSearchParams(window.location.search).get("returnTo") === "record";

  async function refresh(targetDate = date) {
    if (workoutId) {
      const existing = await getWorkoutBundle(workoutId);
      setBundle(existing);
      if (existing) setDate(existing.workout.date);
      return;
    }
    setBundle(await getWorkoutBundleByDate(targetDate));
  }

  useEffect(() => {
    setDraftExercises([]);
    setSelectedTemplate(undefined);
    refresh(date);
  }, [date, workoutId]);

  useEffect(() => {
    setNotes(bundle?.workout.notes ?? "");
  }, [bundle?.workout.id, bundle?.workout.notes]);

  useEffect(() => {
    if (authLoading || !user) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    listTrainingTemplates()
      .then((nextTemplates) => {
        if (cancelled) return;
        setTemplates(nextTemplates);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const persistedSummary = summarizeWorkout(bundle);
  const draftSetCount = draftExercises.reduce((count, draft) => count + draft.sets.length, 0);
  const draftVolume = draftExercises.flatMap((draft) => draft.sets).reduce(
    (total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0),
    0,
  );
  const summary = {
    exerciseCount: persistedSummary.exerciseCount + draftExercises.length,
    setCount: persistedSummary.setCount + draftSetCount,
    totalVolume: persistedSummary.totalVolume + draftVolume,
  };
  const persistedExerciseIds = bundle?.exercises.map((item) => item.workoutExercise.exerciseId) ?? [];
  const allExerciseIds = [...new Set([...persistedExerciseIds, ...draftExercises.map((item) => item.exerciseId)])];
  const pickerResults = useMemo(
    () => filterExercises(exercises, { query, bodyPart: "all", equipment: "all" }).slice(0, 30),
    [exercises, query],
  );

  function addDraftExercise(exerciseId: string, source: DraftExercise["source"]) {
    if (allExerciseIds.includes(exerciseId)) {
      setSaveMessage("该动作已在本次训练草稿中");
      return;
    }
    setDraftExercises((current) => [...current, createDraftExercise(exerciseId, source)]);
  }

  function addExercise(exercise: ExerciseView) {
    addDraftExercise(exercise.id, "manual");
    setPickerOpen(false);
    setQuery("");
  }

  function selectTemplate(template: TrainingTemplate) {
    if (!user) {
      openAuthDialog();
      return;
    }
    setDraftExercises((current) => {
      const manualDrafts = current.filter((item) => item.source === "manual");
      const knownIds = new Set([...persistedExerciseIds, ...manualDrafts.map((item) => item.exerciseId)]);
      const templateDrafts = template.exerciseIds
        .filter((exerciseId) => !knownIds.has(exerciseId))
        .map((exerciseId) => createDraftExercise(exerciseId, "template"));
      return [...manualDrafts, ...templateDrafts];
    });
    setSelectedTemplate(template);
    setSaveMessage(`已展示「${template.name}」动作；点击完成后才会保存`);
  }

  function cancelTemplate() {
    setDraftExercises((current) => current.filter((item) => item.source !== "template"));
    setSelectedTemplate(undefined);
  }

  function removeDraftExercise(id: string) {
    setDraftExercises((current) => current.filter((item) => item.id !== id));
  }

  function updateDraftSet(draftId: string, setId: string, patch: Partial<DraftSet>) {
    setDraftExercises((current) => current.map((draft) => (
      draft.id !== draftId
        ? draft
        : { ...draft, sets: draft.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) }
    )));
  }

  function addDraftSet(draftId: string) {
    setDraftExercises((current) => current.map((draft) => (
      draft.id !== draftId ? draft : { ...draft, sets: [...draft.sets, createDraftSet(draft.sets.at(-1))] }
    )));
  }

  function removeDraftSet(draftId: string, setId: string) {
    setDraftExercises((current) => current.map((draft) => (
      draft.id !== draftId || draft.sets.length === 1
        ? draft
        : { ...draft, sets: draft.sets.filter((set) => set.id !== setId) }
    )));
  }

  async function updateTrainingSet(set: TrainingSet, patch: Partial<TrainingSet>) {
    if (!bundle) return;
    await updateSet(bundle.workout.id, { ...set, ...patch });
    refresh();
  }

  function leaveEditor(targetBundle = bundle) {
    if (returnToRecord) {
      navigate("/record");
      return;
    }
    navigate(targetBundle ? `/workouts/${targetBundle.workout.id}` : "/record");
  }

  async function completeWorkout() {
    const notesChanged = notes !== (bundle?.workout.notes ?? "");
    if (!draftExercises.length && !notesChanged) {
      leaveEditor();
      return;
    }
    setSavingWorkout(true);
    try {
      const draftExerciseInputs: DraftExerciseInput[] = draftExercises.map((draft) => ({
        exerciseId: draft.exerciseId,
        sets: draft.sets.map(({ weightKg, reps }) => ({ weightKg, reps })),
      }));
      const savedBundle = await commitWorkout(date, allExerciseIds, notes, draftExerciseInputs);
      setBundle(savedBundle);
      setDraftExercises([]);
      setSelectedTemplate(undefined);
      if (!authLoading && !user) {
        setCompletionPromptOpen(true);
      } else {
        leaveEditor(savedBundle);
      }
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "训练保存失败，请稍后重试");
    } finally {
      setSavingWorkout(false);
    }
  }

  function closeTemplateSave() {
    setTemplateSaveOpen(false);
    setTemplateName("");
    setTemplateSaveError("");
  }

  async function saveAsTemplate(event: FormEvent) {
    event.preventDefault();
    if (!allExerciseIds.length) return;
    setSavingTemplate(true);
    setTemplateSaveError("");
    try {
      const created = await createTrainingTemplate(templateName, allExerciseIds);
      setTemplates((current) => [...current, created]);
      closeTemplateSave();
      setSaveMessage(`已保存自定义模板「${created.name}」`);
    } catch (error) {
      setTemplateSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div className="page editor-page">
      <header className="page-header compact">
        <button className="icon-button" onClick={() => navigateBack("/record")} type="button"><ArrowLeft size={20} /></button>
        <div><p className="eyebrow">完成后保存训练</p><h1>记录训练</h1></div>
        <button className="text-action" disabled={savingWorkout} onClick={completeWorkout} type="button">{savingWorkout ? "保存中..." : "完成"}</button>
      </header>

      <label className="field">
        <span>训练日期</span>
        <input disabled={Boolean(workoutId)} onChange={(event) => setDate(event.target.value)} type="date" value={date} />
      </label>

      <section className="summary-strip">
        <div><strong>{summary.exerciseCount}</strong><span>动作</span></div>
        <div><strong>{summary.setCount}</strong><span>组</span></div>
        <div><strong>{formatVolume(summary.totalVolume)}</strong><span>训练量</span></div>
      </section>

      <section className="training-starter" aria-label="训练模板">
        <div className="training-starter-heading"><div><p>SMART START</p><h2>更快开始训练</h2></div>{user ? <button className="template-manage-link" onClick={() => navigate("/templates")} type="button">管理模板</button> : <Sparkles size={19} />}</div>
        {!authLoading && !user ? (
          <button className="training-starter-locked" onClick={openAuthDialog} type="button">
            <span className="training-starter-lock"><LockKeyhole size={18} /></span>
            <span><strong>登录后解锁训练模板</strong><small>新手全身模板与自定义训练编排</small></span>
          </button>
        ) : null}
        {user ? (
          <div className="training-starter-content">
            <div className="template-list">
              {templates.map((template) => (
                <button className={selectedTemplate?.id === template.id ? "template-card is-selected" : "template-card"} key={template.id} onClick={() => selectTemplate(template)} type="button">
                  <span>{template.tag}</span><strong>{template.name}</strong><small>{template.description}</small>
                </button>
              ))}
            </div>
            {selectedTemplate ? (
              <div className="selected-template-notice">
                <div><strong>已展示「{selectedTemplate.name}」</strong><span>这些动作仍是草稿；点击完成才会写入训练记录。</span></div>
                <button aria-label="取消选择模板" onClick={cancelTemplate} type="button"><X size={17} /></button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="stack">
        {bundle?.exercises.map((item) => {
          const exercise = byId.get(item.workoutExercise.exerciseId);
          return (
            <article className="workout-exercise" key={item.workoutExercise.id}>
              <div className="workout-exercise-header">
                {exercise ? <img alt={exercise.displayName} src={exercise.imageUrl} /> : null}
                <div><h2>{exercise?.displayName ?? item.workoutExercise.exerciseId}</h2><p>{exercise ? `${exercise.bodyPartZh} · ${exercise.equipmentZh}` : "动作数据缺失"}</p></div>
                <button className="icon-button" onClick={async () => { await deleteWorkoutExercise(bundle.workout.id, item.workoutExercise.id); refresh(); }} type="button"><Trash2 size={18} /></button>
              </div>
              <div className="set-table">
                <div className="set-row set-row-head"><span>组</span><span>重量 kg</span><span>次数</span><span /></div>
                {item.sets.map((set) => (
                  <div className="set-row" key={set.id}>
                    <span>{set.setNumber}</span>
                    <input defaultValue={set.weightKg ?? ""} inputMode="decimal" min="0" onBlur={(event) => updateTrainingSet(set, { weightKg: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" step="0.5" type="number" />
                    <input defaultValue={set.reps ?? ""} inputMode="numeric" min="1" onBlur={(event) => updateTrainingSet(set, { reps: event.target.value ? Number(event.target.value) : undefined })} placeholder="10" step="1" type="number" />
                    <div className="row-actions"><button onClick={async () => { await deleteSet(bundle.workout.id, set.id); refresh(); }} type="button"><Trash2 size={16} /></button></div>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary full-width" onClick={async () => { await addSet(bundle.workout.id, item.workoutExercise.id); refresh(); }} type="button"><Plus size={18} /><span>添加一组</span></button>
            </article>
          );
        })}
        {draftExercises.map((draft) => {
          const exercise = byId.get(draft.exerciseId);
          return (
            <article className="workout-exercise draft-workout" key={draft.id}>
              <div className="workout-exercise-header">
                {exercise ? <img alt={exercise.displayName} src={exercise.imageUrl} /> : null}
                <div><h2>{exercise?.displayName ?? draft.exerciseId}</h2><p>{exercise ? `${exercise.bodyPartZh} · ${exercise.equipmentZh}` : "动作数据缺失"}</p></div>
                <button className="icon-button" onClick={() => removeDraftExercise(draft.id)} type="button"><Trash2 size={18} /></button>
              </div>
              <div className="set-table">
                <div className="set-row set-row-head"><span>组</span><span>重量 kg</span><span>次数</span><span /></div>
                {draft.sets.map((set, index) => (
                  <div className="set-row" key={set.id}>
                    <span>{index + 1}</span>
                    <input defaultValue={set.weightKg ?? ""} inputMode="decimal" min="0" onBlur={(event) => updateDraftSet(draft.id, set.id, { weightKg: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" step="0.5" type="number" />
                    <input defaultValue={set.reps ?? ""} inputMode="numeric" min="1" onBlur={(event) => updateDraftSet(draft.id, set.id, { reps: event.target.value ? Number(event.target.value) : undefined })} placeholder="10" step="1" type="number" />
                    <div className="row-actions"><button aria-label={`删除第 ${index + 1} 组`} disabled={draft.sets.length === 1} onClick={() => removeDraftSet(draft.id, set.id)} type="button"><Trash2 size={16} /></button></div>
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary full-width" onClick={() => addDraftSet(draft.id)} type="button"><Plus size={18} /><span>添加一组</span></button>
              <div className="draft-workout-footer"><span>草稿动作</span><small>可先填写重量和次数；点击完成后保存</small></div>
            </article>
          );
        })}
      </section>

      {!summary.exerciseCount ? <div className="empty-state">先添加一个动作，训练记录就从这里开始。</div> : null}
      <button className="add-exercise-button" onClick={() => setPickerOpen(true)} type="button"><Plus size={20} /><span>添加动作</span></button>
      {user && allExerciseIds.length ? <button className="save-template-button" onClick={() => setTemplateSaveOpen(true)} type="button"><BookmarkPlus size={18} /><span>将当前动作保存为自定义模板</span></button> : null}

      <label className="field"><span>训练备注</span><textarea maxLength={2000} onChange={(event) => { setNotes(event.target.value); setSaveMessage(""); }} placeholder="状态、感受、器械占用情况..." value={notes} /></label>
      {saveMessage ? <p className="status-message">{saveMessage}</p> : null}

      {pickerOpen ? (
        <div className="drawer-backdrop" onClick={() => setPickerOpen(false)}>
          <section className="drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-handle" /><h2>添加动作</h2>
            <label className="search-box"><Search size={18} /><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="搜索动作" value={query} /></label>
            <div className="picker-list">{pickerResults.map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)} type="button"><img alt={exercise.displayName} src={exercise.imageUrl} /><span>{exercise.displayName}</span><small>{exercise.bodyPartZh} · {exercise.equipmentZh}</small></button>)}</div>
          </section>
        </div>
      ) : null}

      {templateSaveOpen ? (
        <div className="drawer-backdrop" onClick={closeTemplateSave}>
          <section aria-modal="true" className="template-save-sheet" onClick={(event) => event.stopPropagation()} role="dialog"><div className="drawer-handle" /><h2>保存自定义模板</h2>
            <p>会保存当前的 {allExerciseIds.length} 个动作；训练记录与重量不会写入模板。</p>
            <form onSubmit={saveAsTemplate}><label className="field"><span>模板名称</span><input autoFocus maxLength={60} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：上肢力量日" required value={templateName} /></label>
              {templateSaveError ? <p className="auth-error">{templateSaveError}</p> : null}
              <button className="btn btn-primary full-width" disabled={savingTemplate} type="submit">{savingTemplate ? "正在保存..." : "保存模板"}</button>
              <button className="btn btn-ghost full-width" onClick={closeTemplateSave} type="button">取消</button>
            </form>
          </section>
        </div>
      ) : null}

      {completionPromptOpen ? <WorkoutCompletionPrompt exerciseCount={summary.exerciseCount} onContinue={() => { dismissAuthPrompt(); setCompletionPromptOpen(false); leaveEditor(bundle); }} onLogin={() => { setCompletionPromptOpen(false); openAuthDialog(); }} setCount={summary.setCount} /> : null}
    </div>
  );
}
