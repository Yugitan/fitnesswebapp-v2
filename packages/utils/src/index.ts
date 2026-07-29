export function formatDateZh(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
}

export function formatVolume(value: number): string {
  return `${Math.round(value).toLocaleString("zh-CN")} kg`;
}
