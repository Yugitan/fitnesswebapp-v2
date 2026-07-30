import { Dumbbell, History, Home, PlusCircle } from "lucide-react";
import { useEffect } from "react";
import { useState } from "react";
import { ExerciseDetailPage } from "../pages/exercises/ExerciseDetailPage";
import { ExercisesPage } from "../pages/exercises/ExercisesPage";
import { FavoritesPage } from "../pages/favorites/FavoritesPage";
import { HistoryPage } from "../pages/history/HistoryPage";
import { RecordPage } from "../pages/record/RecordPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
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

  return <TodayPage />;
}

const navItems = [
  { path: "/", label: "今日", icon: Home },
  { path: "/exercises", label: "动作库", icon: Dumbbell },
  { path: "/record", label: "记录", icon: PlusCircle },
  { path: "/history", label: "历史", icon: History },
];

export function App() {
  const route = useAppRoute();
  const { user, loading: authLoading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const isExerciseDetail = route.parts[0] === "exercises" && Boolean(route.parts[1]);
  const isWorkoutDetail =
    route.parts[0] === "workouts" && Boolean(route.parts[1]) && route.parts[1] !== "new";
  const hideNav = isExerciseDetail || isWorkoutDetail || route.parts[0] === "settings";

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
