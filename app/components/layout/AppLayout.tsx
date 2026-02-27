"use client";

import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { StackedLayout } from "@/app/components/catalyst/stacked-layout";

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
    const leftPaneElement = leftPaneRef.current;
    if (!leftPaneElement) {
      return;
    }

    const scrollElement =
      leftPaneElement.querySelector<HTMLElement>(
        "[data-left-pane-scroll='true']",
      ) ?? leftPaneElement;

    return autoScrollForElements({
      element: scrollElement,
      getAllowedAxis: () => "vertical",
    });
  }, []);

  return (
    <StackedLayout navbar={topBar}>
      <main
        ref={mainPaneRef}
        className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row md:gap-0"
      >
        <section
          ref={leftPaneRef}
          className="min-h-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:shrink-0"
          style={isDesktop ? { width: `${leftPaneWidth}%` } : undefined}
        >
          <div className="h-full min-h-0">{leftColumn}</div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          className="hidden w-2 cursor-col-resize bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 md:block"
        />

        <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:ml-4">
          <div className="h-full min-h-0">{rightColumn}</div>
        </section>
      </main>
    </StackedLayout>
  );
}
