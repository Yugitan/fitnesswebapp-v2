import type { ExerciseView } from "@xiaobai-amax/domain";
import { filterExercises } from "@xiaobai-amax/domain";
import {
  createTrainingTemplate,
  deleteTrainingTemplate,
  listTrainingTemplates,
  type TrainingTemplate,
  updateTrainingTemplate,
} from "@xiaobai-amax/data-client";
import { ArrowLeft, Dumbbell, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { navigateBack } from "../../app/router";
import { useAuth } from "../../shared/hooks/use-auth";
import { useExercises } from "../../shared/hooks/use-exercises";
import { openAuthDialog } from "../../shared/lib/auth-dialog";

export function TemplatesPage() {
  const { user, loading: authLoading } = useAuth();
  const { exercises, byId } = useExercises();
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplate>();
  const [templateName, setTemplateName] = useState("");
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<TrainingTemplate>();
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    if (!user) return;
    setLoading(true);
    try {
      setTemplates(await listTrainingTemplates());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模板加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    refresh();
  }, [authLoading, user?.id]);

  const availableExercises = useMemo(
    () => filterExercises(exercises, { query, bodyPart: "all", equipment: "all" })
      .filter((exercise) => !exerciseIds.includes(exercise.id))
      .slice(0, 12),
    [exerciseIds, exercises, query],
  );
  const builtInTemplates = templates.filter((template) => template.kind === "built-in");
  const customTemplates = templates.filter((template) => template.kind === "custom");

  function openCreate() {
    if (!user) {
      openAuthDialog();
      return;
    }
    setEditingTemplate(undefined);
    setTemplateName("");
    setExerciseIds([]);
    setQuery("");
    setEditorOpen(true);
  }

  function openEdit(template: TrainingTemplate) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setExerciseIds(template.exerciseIds);
    setQuery("");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingTemplate(undefined);
    setTemplateName("");
    setExerciseIds([]);
    setQuery("");
  }

  function addExercise(exercise: ExerciseView) {
    setExerciseIds((current) => current.length >= 12 || current.includes(exercise.id) ? current : [...current, exercise.id]);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!user || !exerciseIds.length) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = editingTemplate
        ? await updateTrainingTemplate(editingTemplate.id, templateName, exerciseIds)
        : await createTrainingTemplate(templateName, exerciseIds);
      await refresh();
      closeEditor();
      setMessage(editingTemplate ? `已更新「${saved.name}」` : `已创建「${saved.name}」`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate() {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      await deleteTrainingTemplate(templateToDelete.id);
      setTemplates((current) => current.filter((template) => template.id !== templateToDelete.id));
      setMessage(`已删除「${templateToDelete.name}」`);
      setTemplateToDelete(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page templates-page">
      <header className="page-header compact">
        <button className="icon-button" onClick={() => navigateBack("/workouts/new")} type="button"><ArrowLeft size={20} /></button>
        <div><p className="eyebrow">TRAINING LIBRARY</p><h1>训练模板</h1></div>
        {user ? <button className="text-action" onClick={openCreate} type="button">新建</button> : null}
      </header>

      {!authLoading && !user ? (
        <section className="template-access-card">
          <span><Dumbbell size={22} /></span>
          <div><h2>登录后管理训练模板</h2><p>创建自己的动作组合，随时修改或删除。</p></div>
          <button className="btn btn-primary" onClick={openAuthDialog} type="button">登录 / 注册</button>
        </section>
      ) : null}

      {user && !editorOpen ? (
        <>
          <section className="template-page-intro">
            <div><p>YOUR ROUTINES</p><h2>把常练的动作组合保存下来</h2><span>自定义模板可随时修改动作和名称。</span></div>
            <button className="template-create-button" onClick={openCreate} type="button"><Plus size={19} /><span>新建模板</span></button>
          </section>

          <TemplateSection emptyCopy="还没有自定义模板。创建一个常用训练编排吧。" loading={loading} templates={customTemplates} title="我的模板">
            {customTemplates.map((template) => <CustomTemplateCard byId={byId} key={template.id} onDelete={() => setTemplateToDelete(template)} onEdit={() => openEdit(template)} template={template} />)}
          </TemplateSection>

          <TemplateSection templates={builtInTemplates} title="系统模板">
            {builtInTemplates.map((template) => <BuiltInTemplateCard key={template.id} template={template} />)}
          </TemplateSection>
        </>
      ) : null}

      {user && editorOpen ? (
        <form className="template-builder" onSubmit={saveTemplate}>
          <div className="template-builder-heading"><div><p>{editingTemplate ? "EDIT TEMPLATE" : "NEW TEMPLATE"}</p><h2>{editingTemplate ? "编辑自定义模板" : "创建自定义模板"}</h2></div><button aria-label="关闭模板编辑器" className="icon-button" disabled={saving} onClick={closeEditor} type="button"><X size={19} /></button></div>
          <label className="field"><span>模板名称</span><input autoFocus maxLength={60} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：上肢力量日" required value={templateName} /></label>
          <section className="template-exercise-editor" aria-label="模板动作">
            <div className="template-exercise-editor-title"><div><span>模板动作</span><small>{exerciseIds.length} / 12 个动作</small></div><p>至少添加 1 个动作，可拖回动作库后再新增。</p></div>
            <div className="template-selected-exercises">
              {exerciseIds.length ? exerciseIds.map((exerciseId) => {
                const exercise = byId.get(exerciseId);
                return <button aria-label={`移除 ${exercise?.displayName ?? exerciseId}`} key={exerciseId} onClick={() => setExerciseIds((current) => current.filter((id) => id !== exerciseId))} type="button"><span>{exercise?.displayName ?? exerciseId}</span><X size={14} /></button>;
              }) : <p>尚未添加动作</p>}
            </div>
            <label className="search-box"><Search size={18} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索并添加动作" value={query} /></label>
            <div className="template-exercise-results">
              {availableExercises.map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)} type="button"><img alt="" src={exercise.imageUrl} /><span><strong>{exercise.displayName}</strong><small>{exercise.bodyPartZh} · {exercise.equipmentZh}</small></span><Plus size={18} /></button>)}
              {!availableExercises.length ? <p>{exerciseIds.length >= 12 ? "最多可添加 12 个动作" : "没有找到可添加的动作"}</p> : null}
            </div>
          </section>
          <button className="btn btn-primary full-width" disabled={saving || !exerciseIds.length} type="submit">{saving ? "保存中..." : editingTemplate ? "保存修改" : "创建模板"}</button>
          <button className="btn btn-ghost full-width" disabled={saving} onClick={closeEditor} type="button">取消</button>
        </form>
      ) : null}

      {message ? <p className="status-message">{message}</p> : null}

      {templateToDelete ? (
        <div className="confirm-backdrop" onClick={() => !deleting && setTemplateToDelete(undefined)}>
          <section className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon"><Trash2 size={20} /></div>
            <h2>删除「{templateToDelete.name}」？</h2>
            <p>模板中的 {templateToDelete.exerciseIds.length} 个动作组合将被删除，已保存的训练记录不会受影响。</p>
            <button className="btn btn-danger full-width" disabled={deleting} onClick={removeTemplate} type="button">{deleting ? "删除中..." : "确认删除"}</button>
            <button className="btn btn-ghost full-width" disabled={deleting} onClick={() => setTemplateToDelete(undefined)} type="button">取消</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

type TemplateSectionProps = {
  children: ReactNode;
  emptyCopy?: string;
  loading?: boolean;
  templates: TrainingTemplate[];
  title: string;
};

function TemplateSection({ children, emptyCopy, loading, templates, title }: TemplateSectionProps) {
  return <section className="template-page-section"><div className="template-page-section-heading"><h2>{title}</h2><span>{templates.length} 个</span></div>{loading ? <p className="template-page-empty">正在加载模板...</p> : templates.length ? <div className="template-page-list">{children}</div> : emptyCopy ? <p className="template-page-empty">{emptyCopy}</p> : null}</section>;
}

function CustomTemplateCard({ byId, onDelete, onEdit, template }: { byId: Map<string, ExerciseView>; onDelete: () => void; onEdit: () => void; template: TrainingTemplate }) {
  const exerciseNames = template.exerciseIds.map((exerciseId) => byId.get(exerciseId)?.displayName ?? exerciseId).join("、");
  return <article className="template-manager-card"><div><span>自定义模板</span><h3>{template.name}</h3><p>{template.exerciseIds.length} 个动作 · {exerciseNames}</p></div><div className="template-manager-actions"><button onClick={onEdit} type="button"><Pencil size={15} /><span>编辑</span></button><button aria-label={`删除模板 ${template.name}`} className="danger" onClick={onDelete} type="button"><Trash2 size={16} /></button></div></article>;
}

function BuiltInTemplateCard({ template }: { template: TrainingTemplate }) {
  return <article className="template-manager-card is-built-in"><div><span>{template.tag}</span><h3>{template.name}</h3><p>{template.description}</p></div><small>系统提供</small></article>;
}
