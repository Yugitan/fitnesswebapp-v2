export type RawExercise = {
  id: string;
  name: string;
  category: string;
  body_part: string;
  equipment: string;
  instructions: Record<string, string>;
  instruction_steps: Record<string, string[]>;
  muscle_group: string;
  secondary_muscles: string[];
  target: string;
  image: string;
  gif_url: string;
  media_id: string;
  created_at: string;
  attribution: string;
};

export type ExerciseView = {
  id: string;
  name: string;
  nameZh?: string;
  displayName: string;
  aliasesZh: string[];
  bodyPart: string;
  bodyPartZh: string;
  equipment: string;
  equipmentZh: string;
  target: string;
  targetZh?: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  secondaryMusclesZh: string[];
  imageUrl: string;
  gifUrl: string;
  instructionSteps: {
    en: string[];
    zh: string[];
  };
  attribution: string;
  searchText: string;
};

export type ExerciseFilters = {
  query: string;
  bodyPart: string;
  equipment: string;
};
