import { Check, Cloud, Dumbbell, ArrowRight } from "lucide-react";

type WorkoutCompletionPromptProps = {
  exerciseCount: number;
  setCount: number;
  onContinue: () => void;
  onLogin: () => void;
};

export function WorkoutCompletionPrompt({
  exerciseCount,
  setCount,
  onContinue,
  onLogin,
}: WorkoutCompletionPromptProps) {
  return (
    <section aria-label="训练完成提醒" className="workout-completion-prompt" role="dialog">
      <div className="workout-completion-topline">
        <span><Check size={14} /> TRAINING LOGGED</span>
        <small>{exerciseCount} 个动作</small>
      </div>
      <div className="workout-completion-heading">
        <div className="workout-completion-icon"><Dumbbell size={22} /></div>
        <div>
          <h2>今天这练，已经记下</h2>
          <p>登录后训练历史可长期保存，换设备也能继续查看。</p>
        </div>
      </div>
      <div className="workout-completion-stats">
        <span><strong>{exerciseCount}</strong> 动作</span>
        <span><strong>{setCount}</strong> 训练组</span>
        <span><Cloud size={14} /> 可同步</span>
      </div>
      <button className="workout-completion-login" onClick={onLogin} type="button">
        <span>登录并保存训练</span>
        <ArrowRight size={18} />
      </button>
      <button className="workout-completion-continue" onClick={onContinue} type="button">
        继续游客使用
      </button>
      <p className="workout-completion-note">NOT NOW · 3 DAYS LATER</p>
    </section>
  );
}
