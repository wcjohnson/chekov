import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStableCallback } from "../../app/lib/utils";

describe("useStableCallback", () => {
  it("keeps a stable function identity across rerenders", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useStableCallback(() => value),
      {
        initialProps: { value: 1 },
      },
    );

    const initialCallback = result.current;
    rerender({ value: 2 });

    expect(result.current).toBe(initialCallback);
  });

  it("invokes the latest callback logic when called from an old reference", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useStableCallback(() => value),
      {
        initialProps: { value: 1 },
      },
    );

    const persistedHandler = result.current;

    expect(persistedHandler()).toBe(1);

    rerender({ value: 2 });

    expect(persistedHandler()).toBe(2);
  });

  it("forwards arguments and return values through the stable wrapper", () => {
    const { result, rerender } = renderHook(
      ({ prefix }: { prefix: string }) =>
        useStableCallback((taskId: string) => `${prefix}:${taskId}`),
      {
        initialProps: { prefix: "before" },
      },
    );

    const callback = result.current;

    expect(callback("t1")).toBe("before:t1");

    rerender({ prefix: "after" });

    expect(callback("t1")).toBe("after:t1");
  });
});
