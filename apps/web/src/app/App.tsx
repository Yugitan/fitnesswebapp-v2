import { Dumbbell, History, Home, PlusCircle, WifiOff } from "lucide-react";
import { useEffect } from "react";
import { useState } from "react";
import { ExerciseDetailPage } from "../pages/exercises/ExerciseDetailPage";
import { ExercisesPage } from "../pages/exercises/ExercisesPage";
import { FavoritesPage } from "../pages/favorites/FavoritesPage";
import { HistoryPage } from "../pages/history/HistoryPage";
import { RecordPage } from "../pages/record/RecordPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { TemplatesPage } from "../pages/templates/TemplatesPage";
import { TodayPage } from "../pages/today/TodayPage";
import { WorkoutDetailPage } from "../pages/workout-detail/WorkoutDetailPage";
import { WorkoutEditorPage } from "../pages/workout-editor/WorkoutEditorPage";
import { AuthDialog } from "../shared/components/AuthDialog";
import { useAuth } from "../shared/hooks/use-auth";
import {
  dismissAuthPrompt,
  OPEN_AUTH_DIALOG_EVENT,
  shouldShowAuthPrompt,
} from "../shared/lib/auth-dialog";
import { navigate, useAppRoute } from "./router";

function resolvePage(parts: string[]) {
  if (parts.length === 0) {
    return <TodayPage />;
  }

  if (parts[0] === "exercises" && parts[1]) {
    return <ExerciseDetailPage exerciseId={parts[1]} />;
  }

  if (parts[0] === "exercises") {
    return <ExercisesPage />;
  }

  if (parts[0] === "workouts" && parts[1] === "new") {
    return <WorkoutEditorPage />;
  }

  if (parts[0] === "workouts" && parts[1] && parts[2] === "edit") {
    return <WorkoutEditorPage workoutId={parts[1]} />;
  }

  if (parts[0] === "workouts" && parts[1]) {
    return <WorkoutDetailPage workoutId={parts[1]} />;
  }

  if (parts[0] === "history") {
    return <HistoryPage />;
  }

  if (parts[0] === "favorites") {
    return <FavoritesPage />;
  }

  if (parts[0] === "record") {
    return <RecordPage />;
  }

  if (parts[0] === "settings") {
    return <SettingsPage />;
  }

  if (parts[0] === "templates") {
    return <TemplatesPage />;
  }

  return <TodayPage />;
}

const navItems = [
  { path: "/", label: "今日", icon: Home },
  { path: "/exercises", label: "动作库", icon: Dumbbell },
  { path: "/record", label: "记录", icon: PlusCircle },
  { path: "/history", label: "历史", icon: History },
];

function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div aria-live="polite" className="offline-notice" role="status">
      <WifiOff size={16} />
      <span>当前离线：已缓存内容仍可查看，训练记录需恢复网络后保存。</span>
    </div>
  );
}

export function App() {
  const route = useAppRoute();
  const { user, loading: authLoading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const isExerciseDetail = route.parts[0] === "exercises" && Boolean(route.parts[1]);
  const isWorkoutDetail =
    route.parts[0] === "workouts" && Boolean(route.parts[1]) && route.parts[1] !== "new";
  const hideNav = isExerciseDetail || isWorkoutDetail || route.parts[0] === "settings" || route.parts[0] === "templates";

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.path]);

  useEffect(() => {
    if (!authLoading && !user && shouldShowAuthPrompt()) {
      setAuthOpen(true);
    }
  }, [authLoading, user]);

  useEffect(() => {
    const open = () => setAuthOpen(true);
    window.addEventListener(OPEN_AUTH_DIALOG_EVENT, open);
    return () => window.removeEventListener(OPEN_AUTH_DIALOG_EVENT, open);
  }, []);

  function closeAuthDialog() {
    dismissAuthPrompt();
    setAuthOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <OfflineNotice />
        <main className={hideNav ? "app-main app-main-full" : "app-main"}>
          {resolvePage(route.parts)}
        </main>
        {!hideNav ? (
          <nav className="bottom-nav" aria-label="主导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.path === "/"
                  ? route.path === "/"
                  : item.path === "/record"
                    ? route.path.startsWith("/workouts")
                      || route.path.startsWith("/record")
                    : route.path.startsWith(item.path);

              return (
                <button
                  className={active ? "bottom-nav-item is-active" : "bottom-nav-item"}
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  type="button"
                >
                  <span className="bottom-nav-icon"><Icon size={19} /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
      <AuthDialog
        onClose={closeAuthDialog}
        onSuccess={() => window.location.reload()}
        open={authOpen}
      />
    </div>
  );
}
