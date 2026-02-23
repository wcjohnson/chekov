export const TAG_COLOR_OPTIONS = [
  {
    key: "red",
    label: "Red",
    badgeClass:
      "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
    swatchClass: "bg-red-500",
  },
  {
    key: "rose",
    label: "Rose",
    badgeClass:
      "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
    swatchClass: "bg-rose-500",
  },
  {
    key: "orange",
    label: "Orange",
    badgeClass:
      "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200",
    swatchClass: "bg-orange-500",
  },
  {
    key: "amber",
    label: "Amber",
    badgeClass:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    swatchClass: "bg-amber-500",
  },
  {
    key: "yellow",
    label: "Yellow",
    badgeClass:
      "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200",
    swatchClass: "bg-yellow-500",
  },
  {
    key: "lime",
    label: "Lime",
    badgeClass:
      "border-lime-300 bg-lime-100 text-lime-800 dark:border-lime-800 dark:bg-lime-950/50 dark:text-lime-200",
    swatchClass: "bg-lime-500",
  },
  {
    key: "green",
    label: "Green",
    badgeClass:
      "border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200",
    swatchClass: "bg-green-500",
  },
  {
    key: "emerald",
    label: "Emerald",
    badgeClass:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    swatchClass: "bg-emerald-500",
  },
  {
    key: "teal",
    label: "Teal",
    badgeClass:
      "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
    swatchClass: "bg-teal-500",
  },
  {
    key: "cyan",
    label: "Cyan",
    badgeClass:
      "border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200",
    swatchClass: "bg-cyan-500",
  },
  {
    key: "sky",
    label: "Sky",
    badgeClass:
      "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
    swatchClass: "bg-sky-500",
  },
  {
    key: "blue",
    label: "Blue",
    badgeClass:
      "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    swatchClass: "bg-blue-500",
  },
  {
    key: "indigo",
    label: "Indigo",
    badgeClass:
      "border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200",
    swatchClass: "bg-indigo-500",
  },
  {
    key: "violet",
    label: "Violet",
    badgeClass:
      "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
    swatchClass: "bg-violet-500",
  },
  {
    key: "purple",
    label: "Purple",
    badgeClass:
      "border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
    swatchClass: "bg-purple-500",
  },
  {
    key: "fuchsia",
    label: "Fuchsia",
    badgeClass:
      "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200",
    swatchClass: "bg-fuchsia-500",
  },
] as const;

export type TagColorKey = (typeof TAG_COLOR_OPTIONS)[number]["key"];

const TAG_COLOR_OPTION_MAP: Record<
  TagColorKey,
  {
    badgeClass: string;
    swatchClass: string;
  }
> = TAG_COLOR_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.key] = {
      badgeClass: option.badgeClass,
      swatchClass: option.swatchClass,
    };

    return accumulator;
  },
  {} as Record<
    TagColorKey,
    {
      badgeClass: string;
      swatchClass: string;
    }
  >,
);

const TAG_COLOR_KEY_SET = new Set<string>(
  TAG_COLOR_OPTIONS.map((option) => option.key),
);

export const isTagColorKey = (value: string): value is TagColorKey =>
  TAG_COLOR_KEY_SET.has(value);

export const DEFAULT_TAG_BADGE_CLASS =
  "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

export const getTagBadgeClasses = (colorKey?: TagColorKey): string => {
  if (!colorKey) {
    return DEFAULT_TAG_BADGE_CLASS;
  }

  return TAG_COLOR_OPTION_MAP[colorKey]?.badgeClass ?? DEFAULT_TAG_BADGE_CLASS;
};

export const getTagSwatchClasses = (colorKey: TagColorKey): string =>
  TAG_COLOR_OPTION_MAP[colorKey].swatchClass;
