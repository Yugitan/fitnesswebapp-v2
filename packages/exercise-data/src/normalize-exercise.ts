import {
  normalizeSearchText,
  type ExerciseView,
  type RawExercise,
} from "@xiaobai-amax/domain";
import { bodyPartZh, equipmentZh, muscleZh, nameAliasRules } from "./dictionaries";
import { translateExerciseName } from "./translate-exercise-name";

const ASSET_PREFIX = "/exercises-dataset";

function getAliases(name: string): string[] {
  const normalizedName = normalizeSearchText(name);
  return nameAliasRules
    .filter(([keyword]) => normalizedName.includes(keyword))
    .flatMap(([, aliases]) => aliases);
}

export function normalizeExercise(raw: RawExercise): ExerciseView {
  const aliasesZh = getAliases(raw.name);
  const translatedName = translateExerciseName(raw.name, raw.equipment);
  const targetZh = muscleZh[raw.target];
  const secondaryMusclesZh = raw.secondary_muscles.map((muscle) => muscleZh[muscle] ?? muscle);
  const bodyPartLabel = bodyPartZh[raw.body_part] ?? raw.body_part;
  const equipmentLabel = equipmentZh[raw.equipment] ?? raw.equipment;
  const displayName = translatedName;
  const zhSteps = raw.instruction_steps.zh?.length
    ? raw.instruction_steps.zh
    : raw.instructions.zh
      ? raw.instructions.zh.split(/。|\n/).filter(Boolean)
      : [];

  const searchText = normalizeSearchText(
    [
      raw.id,
      raw.name,
      raw.body_part,
      raw.equipment,
      raw.target,
      raw.muscle_group,
      ...raw.secondary_muscles,
      ...secondaryMusclesZh,
      ...aliasesZh,
      translatedName,
      bodyPartLabel,
      equipmentLabel,
      targetZh,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    id: raw.id,
    name: raw.name,
    nameZh: translatedName,
    displayName,
    aliasesZh,
    bodyPart: raw.body_part,
    bodyPartZh: bodyPartLabel,
    equipment: raw.equipment,
    equipmentZh: equipmentLabel,
    target: raw.target,
    targetZh,
    muscleGroup: raw.muscle_group,
    secondaryMuscles: raw.secondary_muscles,
    secondaryMusclesZh,
    imageUrl: `${ASSET_PREFIX}/${raw.image}`,
    gifUrl: `${ASSET_PREFIX}/${raw.gif_url}`,
    instructionSteps: {
      en: raw.instruction_steps.en ?? [],
      zh: zhSteps,
    },
    attribution: raw.attribution,
    searchText,
  };
}
