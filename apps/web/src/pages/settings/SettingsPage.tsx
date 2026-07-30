import {
  clearAllData,
  exportAllData,
  importAllData,
  listWorkouts,
  logoutUser,
  seedMayJuneTestWorkouts,
} from "@xiaobai-amax/data-client";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Database,
  Download,
  HardDrive,
  Info,
  LogOut,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigateBack } from "../../app/router";
import { useAuth } from "../../shared/hooks/use-auth";
import { openAuthDialog } from "../../shared/lib/auth-dialog";

export function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
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
    setMessage("当前身份的数据已清空");
    setConfirmClear(false);
  }

  async function handleSeedTestData() {
    const count = await seedMayJuneTestWorkouts();
    await refresh();
    setMessage(`已生成 ${count} 条 5、6 月测试训练记录`);
  }

  return (
    <div className="page settings-page">
      <header className="settings-page-header">
        <button className="icon-button" onClick={() => navigateBack("/")} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">AMAX / SETTINGS</p>
          <h1>设置</h1>
        </div>
      </header>

      <section className="settings-account-card">
        <div className="settings-account-topline">
          <span>{user ? "SIGNED IN" : "GUEST MODE"}</span>
          <ShieldCheck size={17} />
        </div>
        {authLoading ? <p className="settings-account-loading">正在检查登录状态...</p> : user ? (
          <div className="settings-account-content">
            <div className="settings-account-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
            <div className="settings-account-copy">
              <h2>{user.displayName}</h2>
              <p>{user.email}</p>
            </div>
            <button
              aria-label="退出登录"
              className="settings-account-action"
              onClick={async () => {
                await logoutUser();
                window.location.reload();
              }}
              type="button"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div className="settings-guest-content">
            <div>
              <h2>游客训练档案</h2>
              <p>当前数据已隔离保存。登录后可自动合并到你的账号。</p>
            </div>
            <button onClick={openAuthDialog} type="button">
              <span>登录 / 注册</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </section>

      <section className="settings-data-overview">
        <div className="settings-data-icon"><HardDrive size={20} /></div>
        <div>
          <span>有效训练记录</span>
          <strong>{workoutCount}</strong>
        </div>
        <p>{user ? "账号空间" : "游客空间"}<br />PRIVATE DATA</p>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <div><span>DATA TOOLS</span><h2>数据操作</h2></div>
          <small>仅影响当前身份</small>
        </div>
        <div className="settings-menu">
        {import.meta.env.DEV ? (
          <button className="settings-row" onClick={handleSeedTestData} type="button">
            <span className="settings-row-icon"><Database size={19} /></span>
            <span className="settings-row-copy"><strong>生成测试数据</strong><small>写入 5、6 月训练记录</small></span>
            <em>DEV</em>
            <ChevronRight className="settings-row-chevron" size={18} />
          </button>
        ) : null}
        <button className="settings-row" onClick={handleExport} type="button">
          <span className="settings-row-icon"><Download size={19} /></span>
          <span className="settings-row-copy"><strong>导出数据备份</strong><small>下载 JSON 文件</small></span>
          <ChevronRight className="settings-row-chevron" size={18} />
        </button>
        <button className="settings-row" onClick={() => fileInputRef.current?.click()} type="button">
          <span className="settings-row-icon"><Upload size={19} /></span>
          <span className="settings-row-copy"><strong>导入数据备份</strong><small>恢复当前身份数据</small></span>
          <ChevronRight className="settings-row-chevron" size={18} />
        </button>
        <input
          accept="application/json"
          hidden
          onChange={(event) => handleImport(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
        </div>
        {message ? <p className="settings-status-message">{message}</p> : null}
      </section>

      <section className="settings-section">
        <div className="settings-section-title">
          <div><span>SYSTEM</span><h2>其他</h2></div>
        </div>
        <div className="settings-menu">
          <div className="settings-info-row">
            <span className="settings-row-icon"><Info size={19} /></span>
            <span className="settings-row-copy"><strong>动作素材</strong><small>本地动作库 · © Gym visual</small></span>
          </div>
          <button className="settings-row danger" onClick={() => setConfirmClear(true)} type="button">
            <span className="settings-row-icon"><Trash2 size={19} /></span>
            <span className="settings-row-copy"><strong>清空当前身份数据</strong><small>训练记录与收藏将被删除</small></span>
            <ChevronRight className="settings-row-chevron" size={18} />
          </button>
        </div>
      </section>

      {confirmClear ? (
        <div className="confirm-backdrop" onClick={() => setConfirmClear(false)}>
          <section className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon">
              <Trash2 size={20} />
            </div>
            <h2>清空当前身份数据？</h2>
            <p>此操作只会删除当前账号或游客的 {workoutCount} 条训练记录和收藏，且无法恢复。</p>
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
