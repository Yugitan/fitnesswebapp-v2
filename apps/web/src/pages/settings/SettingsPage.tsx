import {
  clearAllData,
  exportAllData,
  importAllData,
  listWorkouts,
  seedMayJuneTestWorkouts,
} from "@xiaobai-amax/local-db";
import { ArrowLeft, ChevronRight, Database, Download, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigateBack } from "../../app/router";

export function SettingsPage() {
  const [workoutCount, setWorkoutCount] = useState(0);
  const [message, setMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const workouts = await listWorkouts();
    setWorkoutCount(workouts.length);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleExport() {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `xiaobai-amax-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("数据已导出");
  }

  async function handleImport(file?: File) {
    if (!file) return;
    await importAllData(await file.text());
    await refresh();
    setMessage("数据已导入");
  }

  async function handleClear() {
    await clearAllData();
    await refresh();
    setMessage("本地数据已清空");
    setConfirmClear(false);
  }

  async function handleSeedTestData() {
    const count = await seedMayJuneTestWorkouts();
    await refresh();
    setMessage(`已生成 ${count} 条 5、6 月测试训练记录`);
  }

  return (
    <div className="page">
      <header className="page-header compact settings-header">
        <button className="icon-button" onClick={() => navigateBack("/")} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">本地优先</p>
          <h1>设置</h1>
        </div>
      </header>

      <section className="settings-panel">
        <h2>数据状态</h2>
        <p>训练记录保存在当前设备。当前共有 {workoutCount} 条训练记录。</p>
      </section>

      <section className="settings-panel">
        <h2>数据操作</h2>
        {import.meta.env.DEV ? (
          <button className="settings-row" onClick={handleSeedTestData} type="button">
            <Database size={20} />
            <span>生成 5、6 月测试数据</span>
            <ChevronRight className="settings-row-chevron" size={18} />
          </button>
        ) : null}
        <button className="settings-row" onClick={handleExport} type="button">
          <Download size={20} />
          <span>导出 JSON 备份</span>
          <ChevronRight className="settings-row-chevron" size={18} />
        </button>
        <button className="settings-row" onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={20} />
          <span>导入 JSON 备份</span>
          <ChevronRight className="settings-row-chevron" size={18} />
        </button>
        <button className="settings-row danger" onClick={() => setConfirmClear(true)} type="button">
          <Trash2 size={20} />
          <span>清空本地数据</span>
          <ChevronRight className="settings-row-chevron" size={18} />
        </button>
        <input
          accept="application/json"
          hidden
          onChange={(event) => handleImport(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
        {message ? <p className="status-message">{message}</p> : null}
      </section>

      <section className="settings-panel">
        <h2>关于动作素材</h2>
        <p>动作缩略图和 GIF 来自本地动作库，展示时保留媒体归属：© Gym visual。</p>
      </section>

      {confirmClear ? (
        <div className="confirm-backdrop" onClick={() => setConfirmClear(false)}>
          <section className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon">
              <Trash2 size={20} />
            </div>
            <h2>清空本地数据？</h2>
            <p>此操作会删除当前设备上的 {workoutCount} 条训练记录和收藏，且无法恢复。</p>
            <button className="btn btn-danger full-width" onClick={handleClear} type="button">
              确认清空
            </button>
            <button className="btn btn-ghost full-width" onClick={() => setConfirmClear(false)} type="button">
              取消
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
