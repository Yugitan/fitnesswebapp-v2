import { equipmentZh, nameAliasRules } from "./dictionaries";

const phraseTranslations: Array<[RegExp, string]> = [
  [/45°/g, "45度"],
  [/3\/4/g, "四分之三"],
  [/close grip/g, "窄握"],
  [/wide grip/g, "宽握"],
  [/reverse grip/g, "反握"],
  [/single arm/g, "单臂"],
  [/one arm/g, "单臂"],
  [/single leg/g, "单腿"],
  [/one leg/g, "单腿"],
  [/seated/g, "坐姿"],
  [/standing/g, "站姿"],
  [/lying/g, "仰卧"],
  [/incline/g, "上斜"],
  [/decline/g, "下斜"],
  [/flat bench/g, "平板"],
  [/bench press/g, "卧推"],
  [/chest press/g, "推胸"],
  [/shoulder press/g, "肩推"],
  [/military press/g, "推举"],
  [/leg press/g, "腿举"],
  [/lat pulldown/g, "高位下拉"],
  [/pulldown/g, "下拉"],
  [/pull down/g, "下拉"],
  [/pull up/g, "引体向上"],
  [/pull-up/g, "引体向上"],
  [/chin up/g, "反握引体向上"],
  [/push up/g, "俯卧撑"],
  [/push-up/g, "俯卧撑"],
  [/sit up/g, "仰卧起坐"],
  [/sit-up/g, "仰卧起坐"],
  [/side bend/g, "侧屈"],
  [/air bike/g, "空中自行车"],
  [/all fours squad stretch/g, "四足蹲姿拉伸"],
  [/squad stretch/g, "蹲姿拉伸"],
  [/lateral raise/g, "侧平举"],
  [/front raise/g, "前平举"],
  [/rear delt raise/g, "俯身飞鸟"],
  [/biceps curl/g, "肱二头肌弯举"],
  [/hammer curl/g, "锤式弯举"],
  [/preacher curl/g, "牧师凳弯举"],
  [/triceps extension/g, "肱三头肌伸展"],
  [/tricep extension/g, "肱三头肌伸展"],
  [/skull crusher/g, "仰卧臂屈伸"],
  [/leg extension/g, "腿屈伸"],
  [/leg curl/g, "腿弯举"],
  [/calf raise/g, "提踵"],
  [/hip thrust/g, "臀推"],
  [/glute bridge/g, "臀桥"],
  [/deadlift/g, "硬拉"],
  [/squat/g, "深蹲"],
  [/lunge/g, "弓步"],
  [/row/g, "划船"],
  [/fly/g, "飞鸟"],
  [/dip/g, "臂屈伸"],
  [/crunch/g, "卷腹"],
  [/plank/g, "平板支撑"],
  [/twist/g, "转体"],
  [/rotation/g, "旋转"],
  [/raise/g, "抬举"],
  [/curl/g, "弯举"],
  [/press/g, "推举"],
  [/extension/g, "伸展"],
  [/stretch/g, "拉伸"],
  [/bridge/g, "桥式"],
  [/kickback/g, "后踢"],
  [/shrug/g, "耸肩"],
  [/step up/g, "登阶"],
  [/mountain climber/g, "登山跑"],
  [/burpee/g, "波比跳"],
  [/jump/g, "跳"],
  [/run/g, "跑"],
  [/walk/g, "走"],
];

const wordTranslations: Record<string, string> = {
  alternate: "交替",
  alternating: "交替",
  assisted: "辅助",
  back: "背部",
  bent: "俯身",
  bicycle: "自行车",
  bodyweight: "自重",
  chest: "胸部",
  decline: "下斜",
  deep: "深度",
  elevated: "抬高",
  external: "外旋",
  floor: "地面",
  forward: "前向",
  frog: "蛙式",
  hack: "哈克",
  high: "高位",
  hip: "髋部",
  hyperextension: "背伸",
  internal: "内旋",
  jackknife: "折刀",
  kneeling: "跪姿",
  knee: "膝",
  low: "低位",
  lower: "下部",
  oblique: "腹斜肌",
  over: "过顶",
  overhead: "过顶",
  pistol: "手枪",
  rear: "后束",
  reverse: "反向",
  romanian: "罗马尼亚",
  russian: "俄罗斯",
  side: "侧向",
  split: "分腿",
  straight: "直臂",
  sumo: "相扑",
  supported: "支撑",
  tate: "泰特",
  upper: "上部",
  vertical: "垂直",
  wall: "靠墙",
  weighted: "负重",
};

function cleanupName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function translateExerciseName(name: string, equipment: string): string {
  const lowerName = cleanupName(name.toLowerCase());
  const alias = nameAliasRules.find(([keyword]) => lowerName.includes(keyword))?.[1][0];
  let translated = lowerName;

  phraseTranslations.forEach(([pattern, replacement]) => {
    translated = translated.replace(pattern, ` ${replacement} `);
  });

  const tokens = translated
    .split(/\s+/)
    .map((token) => {
      if (!token) return "";
      if (/^[\u4e00-\u9fa5\d度]+$/.test(token)) return token;
      if (equipmentZh[token]) return equipmentZh[token];
      if (wordTranslations[token]) return wordTranslations[token];
      if (/^\d+$/.test(token)) return token;
      return "";
    })
    .filter(Boolean);

  const result = Array.from(new Set(tokens)).join("");

  if (result) {
    return result;
  }

  if (alias) {
    return `${equipmentZh[equipment] ?? ""}${alias}`;
  }

  return `${equipmentZh[equipment] ?? ""}动作`;
}
