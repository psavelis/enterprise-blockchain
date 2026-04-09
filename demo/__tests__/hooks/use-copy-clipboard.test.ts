import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCopyClipboard } from "@/hooks/use-copy-clipboard";

describe("useCopyClipboard", () => {
  const mockWriteText = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should initialize with copied as false", () => {
    const { result } = renderHook(() => useCopyClipboard());
    expect(result.current.copied).toBe(false);
  });

  it("should set copied to true after successful copy", async () => {
    const { result } = renderHook(() => useCopyClipboard());

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(mockWriteText).toHaveBeenCalledWith("test text");
    expect(result.current.copied).toBe(true);
  });

  it("should reset copied to false after timeout", async () => {
    const { result } = renderHook(() => useCopyClipboard(1000));

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.copied).toBe(false);
  });

  it("should return true on successful copy", async () => {
    const { result } = renderHook(() => useCopyClipboard());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.copy("test text");
    });

    expect(returnValue).toBe(true);
  });

  it("should return false on failed copy", async () => {
    mockWriteText.mockRejectedValue(new Error("Failed"));
    const { result } = renderHook(() => useCopyClipboard());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.copy("test text");
    });

    expect(returnValue).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("should use custom timeout", async () => {
    const { result } = renderHook(() => useCopyClipboard(500));

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });
});
