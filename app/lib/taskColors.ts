export const TASK_COLOR_OPTIONS = [
  { key: "zinc", label: "Gray", swatchClass: "bg-zinc-500" },
  { key: "red", label: "Red", swatchClass: "bg-red-500" },
  { key: "orange", label: "Orange", swatchClass: "bg-orange-500" },
  { key: "amber", label: "Amber", swatchClass: "bg-amber-500" },
  { key: "yellow", label: "Yellow", swatchClass: "bg-yellow-500" },
  { key: "lime", label: "Lime", swatchClass: "bg-lime-500" },
  { key: "green", label: "Green", swatchClass: "bg-green-500" },
  { key: "emerald", label: "Emerald", swatchClass: "bg-emerald-500" },
  { key: "teal", label: "Teal", swatchClass: "bg-teal-500" },
  { key: "cyan", label: "Cyan", swatchClass: "bg-cyan-500" },
  { key: "sky", label: "Sky", swatchClass: "bg-sky-500" },
  { key: "blue", label: "Blue", swatchClass: "bg-blue-500" },
  { key: "indigo", label: "Indigo", swatchClass: "bg-indigo-500" },
  { key: "violet", label: "Violet", swatchClass: "bg-violet-500" },
  { key: "purple", label: "Purple", swatchClass: "bg-purple-500" },
  { key: "fuchsia", label: "Fuchsia", swatchClass: "bg-fuchsia-500" },
  { key: "pink", label: "Pink", swatchClass: "bg-pink-500" },
  { key: "rose", label: "Rose", swatchClass: "bg-rose-500" },
] as const;

export type TaskColorKey = (typeof TASK_COLOR_OPTIONS)[number]["key"];

const TASK_COLOR_KEY_SET = new Set<string>(
  TASK_COLOR_OPTIONS.map((option) => option.key),
);

export const isTaskColorKey = (value: string): value is TaskColorKey =>
  TASK_COLOR_KEY_SET.has(value);

const TASK_ROW_BG_CLASSES: Record<TaskColorKey, string> = {
  zinc: "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800",
  red: "bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-950/60",
  orange:
    "bg-orange-100 hover:bg-orange-200 dark:bg-orange-950/40 dark:hover:bg-orange-950/60",
  amber:
    "bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-950/60",
  yellow:
    "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-950/40 dark:hover:bg-yellow-950/60",
  lime: "bg-lime-100 hover:bg-lime-200 dark:bg-lime-950/40 dark:hover:bg-lime-950/60",
  green:
    "bg-green-100 hover:bg-green-200 dark:bg-green-950/40 dark:hover:bg-green-950/60",
  emerald:
    "bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60",
  teal: "bg-teal-100 hover:bg-teal-200 dark:bg-teal-950/40 dark:hover:bg-teal-950/60",
  cyan: "bg-cyan-100 hover:bg-cyan-200 dark:bg-cyan-950/40 dark:hover:bg-cyan-950/60",
  sky: "bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/40 dark:hover:bg-sky-950/60",
  blue: "bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/40 dark:hover:bg-blue-950/60",
  indigo:
    "bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60",
  violet:
    "bg-violet-100 hover:bg-violet-200 dark:bg-violet-950/40 dark:hover:bg-violet-950/60",
  purple:
    "bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/40 dark:hover:bg-purple-950/60",
  fuchsia:
    "bg-fuchsia-100 hover:bg-fuchsia-200 dark:bg-fuchsia-950/40 dark:hover:bg-fuchsia-950/60",
  pink: "bg-pink-100 hover:bg-pink-200 dark:bg-pink-950/40 dark:hover:bg-pink-950/60",
  rose: "bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-950/60",
};

export const getTaskRowColorClasses = (colorKey?: TaskColorKey): string =>
  colorKey ? TASK_ROW_BG_CLASSES[colorKey] : "";

export const getTaskSwatchClasses = (colorKey: TaskColorKey): string =>
  TASK_COLOR_OPTIONS.find((option) => option.key === colorKey)?.swatchClass ??
  "bg-zinc-500";
