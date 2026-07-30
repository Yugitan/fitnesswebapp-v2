import {
  loginUser,
  registerUser,
  type AuthUser,
} from "@xiaobai-amax/data-client";
import { ArrowRight, Check, Dumbbell, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
};

type Mode = "login" | "register";

export function AuthDialog({ open, onClose, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = mode === "login"
        ? await loginUser({ email, password })
        : await registerUser({ displayName, email, password });
      onSuccess(user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-backdrop" onClick={onClose}>
      <section aria-modal="true" className="auth-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="auth-hero">
          <button aria-label="暂不登录" className="auth-close" onClick={onClose} type="button">
            <X size={19} />
          </button>
          <div className="auth-brand-row">
            <span className="auth-brand"><Dumbbell size={17} /> AMAX</span>
            <span className="auth-kicker">ACCOUNT SYNC</span>
          </div>
          <h2>{mode === "login" ? "把每一次训练，\n留在你的账号里" : "建立你的训练档案"}</h2>
          <p>游客数据会在登录后自动合并，你刚刚记录的内容不会丢失。</p>
          <div className="auth-benefits" aria-label="登录权益">
            <span><Check size={13} />训练记录</span>
            <span><Check size={13} />动作收藏</span>
            <span><Check size={13} />数据隔离</span>
          </div>
        </div>

        <div className="auth-body">
          <div className="auth-tabs">
            <button className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")} type="button">已有账号</button>
            <button className={mode === "register" ? "is-active" : ""} onClick={() => setMode("register")} type="button">创建账号</button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" ? (
              <label>
                <span>昵称</span>
                <input autoComplete="name" maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="你的训练昵称" required value={displayName} />
              </label>
            ) : null}
            <label>
              <span>邮箱</span>
              <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} />
            </label>
            <label>
              <span>密码</span>
              <input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" required type="password" value={password} />
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            <button className="auth-submit" disabled={submitting} type="submit">
              <span>{submitting ? "处理中..." : mode === "login" ? "登录并同步" : "注册并同步"}</span>
              {!submitting ? <ArrowRight size={18} /> : null}
            </button>
          </form>

          <button className="auth-guest-action" onClick={onClose} type="button">继续游客模式</button>
          <p className="auth-reminder-note">NOT NOW · 3 DAYS LATER</p>
        </div>
      </section>
    </div>
  );
}
