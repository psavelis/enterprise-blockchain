import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProofBox } from "@/components/results/proof-box";

vi.mock("@/hooks/use-copy-clipboard", () => ({
  useCopyClipboard: () => ({
    copied: false,
    copy: vi.fn(),
  }),
}));

describe("ProofBox", () => {
  const mockProof = {
    id: "proof-123-abc-def",
    txCount: 42,
    stateRoot: "0xabcdef1234567890abcdef1234567890",
    proof: "0x1234567890abcdef1234567890abcdef1234567890abcdef",
  };

  it("should render the STARK Block Proof title", () => {
    render(<ProofBox proof={mockProof} />);
    expect(screen.getByText("STARK Block Proof")).toBeInTheDocument();
  });

  it("should display truncated proof hash", () => {
    render(<ProofBox proof={mockProof} />);
    const proofDisplay = screen.getByText(/0x1234/);
    expect(proofDisplay).toBeInTheDocument();
  });

  it("should display transaction count", () => {
    render(<ProofBox proof={mockProof} />);
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("should display Block Proof ID label", () => {
    render(<ProofBox proof={mockProof} />);
    expect(screen.getByText("Block Proof ID")).toBeInTheDocument();
  });

  it("should display State Root label", () => {
    render(<ProofBox proof={mockProof} />);
    expect(screen.getByText("State Root")).toBeInTheDocument();
  });

  it("should render copy button", () => {
    render(<ProofBox proof={mockProof} />);
    const copyButton = screen.getByRole("button");
    expect(copyButton).toBeInTheDocument();
  });
});
