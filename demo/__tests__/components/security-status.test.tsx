import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SecurityStatus } from "@/components/results/security-status";

describe("SecurityStatus", () => {
  it("should render Post-Quantum Signature label", () => {
    render(<SecurityStatus pqVerified={false} mpcActive={false} />);
    expect(screen.getByText("Post-Quantum Signature")).toBeInTheDocument();
  });

  it("should render MPC/HSM Status label", () => {
    render(<SecurityStatus pqVerified={false} mpcActive={false} />);
    expect(screen.getByText("MPC/HSM Status")).toBeInTheDocument();
  });

  it("should show Pending when pqVerified is false", () => {
    render(<SecurityStatus pqVerified={false} mpcActive={false} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should show Verified (ML-DSA-65) when pqVerified is true", () => {
    render(<SecurityStatus pqVerified={true} mpcActive={false} />);
    expect(screen.getByText("Verified (ML-DSA-65)")).toBeInTheDocument();
  });

  it("should show Inactive when mpcActive is false", () => {
    render(<SecurityStatus pqVerified={false} mpcActive={false} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("should show Active when mpcActive is true", () => {
    render(<SecurityStatus pqVerified={false} mpcActive={true} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("should show both verified and active when both are true", () => {
    render(<SecurityStatus pqVerified={true} mpcActive={true} />);
    expect(screen.getByText("Verified (ML-DSA-65)")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
