import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
const mockReset = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockSettlementState = {
  status: "completed" as const,
  rail: "solana" as const,
  result: {
    blockProof: {
      id: "proof-123",
      txCount: 10,
      stateRoot: "0xabc",
      proof: "0x123456",
    },
    rails: {
      solana: { signature: "sig123", slot: 12345 },
    },
    security: {
      pqVerified: true,
      mpcActive: true,
    },
  },
  reset: mockReset,
};

vi.mock("@/context/settlement-context", () => ({
  useSettlement: () => mockSettlementState,
}));

vi.mock("@/hooks/use-copy-clipboard", () => ({
  useCopyClipboard: () => ({
    copied: false,
    copy: vi.fn(),
  }),
}));

describe("ResultsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render Settlement Complete header", async () => {
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);
    expect(screen.getByText("Settlement Complete")).toBeInTheDocument();
  });

  it("should render Verified badge", async () => {
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("should render ProofBox with block proof", async () => {
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);
    expect(screen.getByText("STARK Block Proof")).toBeInTheDocument();
  });

  it("should render SecurityStatus", async () => {
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);
    expect(screen.getByText("Post-Quantum Signature")).toBeInTheDocument();
    expect(screen.getByText("MPC/HSM Status")).toBeInTheDocument();
  });

  it("should render Start New Settlement button", async () => {
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);
    expect(screen.getByText("Start New Settlement")).toBeInTheDocument();
  });

  it("should call reset and navigate on button click", async () => {
    const user = userEvent.setup();
    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);

    await user.click(screen.getByText("Start New Settlement"));

    expect(mockReset).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("ResultsPage - redirect behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should redirect to home when status is not completed", async () => {
    vi.doMock("@/context/settlement-context", () => ({
      useSettlement: () => ({
        ...mockSettlementState,
        status: "idle",
        result: null,
      }),
    }));

    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("should redirect to home when result is null", async () => {
    vi.doMock("@/context/settlement-context", () => ({
      useSettlement: () => ({
        ...mockSettlementState,
        status: "completed",
        result: null,
      }),
    }));

    const { default: ResultsPage } = await import("@/app/results/page");
    render(<ResultsPage />);

    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
