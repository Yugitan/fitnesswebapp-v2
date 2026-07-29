export type Workout = {
  id: string;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutExercise = {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  notes?: string;
};

export type TrainingSet = {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  notes?: string;
  createdAt: string;
};

export type WorkoutBundle = {
  workout: Workout;
  exercises: Array<{
    workoutExercise: WorkoutExercise;
    sets: TrainingSet[];
  }>;
};

export type WorkoutSummary = {
  exerciseCount: number;
  setCount: number;
  totalVolume: number;
};
