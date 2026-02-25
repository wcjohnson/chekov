"use client";

import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

type AppLayoutProps = {
  mainPaneRef: RefObject<HTMLElement | null>;
  isDesktop: boolean;
  leftPaneWidth: number;
  onResizeStart: () => void;
  topBar: ReactNode;
  leftColumn: ReactNode;
  rightColumn: ReactNode;
};

export function AppLayout({
  mainPaneRef,
  isDesktop,
  leftPaneWidth,
  onResizeStart,
  topBar,
  leftColumn,
  rightColumn,
}: AppLayoutProps) {
  const leftPaneRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = leftPaneRef.current;
    if (!element) {
      return;
    }

    return autoScrollForElements({
      element,
      getAllowedAxis: () => "vertical",
    });
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {topBar}

      <main
        ref={mainPaneRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row md:gap-0"
      >
        <section
          ref={leftPaneRef}
          className="min-h-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:shrink-0"
          style={isDesktop ? { width: `${leftPaneWidth}%` } : undefined}
        >
          {leftColumn}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          className="hidden w-2 cursor-col-resize bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 md:block"
        />

        <section className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:ml-4">
          {rightColumn}
        </section>
      </main>
    </div>
  );
}
