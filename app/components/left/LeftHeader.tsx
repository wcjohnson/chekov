"use client";

type LeftHeaderProps = {
  mode: "task" | "edit";
  visibleTasksCount: number;
  isSettingDependencies: boolean;
  editSelectedCount: number;
  pendingDependencyCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

export function LeftHeader({
  mode,
  visibleTasksCount,
  isSettingDependencies,
  editSelectedCount,
  pendingDependencyCount,
  onSelectAll,
  onClearSelection,
}: LeftHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {mode === "task" ? "Available Tasks" : "All Tasks"}
      </h2>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{visibleTasksCount}</span>
        {mode === "edit" && (
          <>
            <button
              type="button"
              onClick={onSelectAll}
              disabled={isSettingDependencies || visibleTasksCount === 0}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              disabled={isSettingDependencies ? pendingDependencyCount === 0 : editSelectedCount === 0}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Clear Selection
            </button>
          </>
        )}
      </div>
    </div>
  );
}
