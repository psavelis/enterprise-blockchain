import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettlementProvider, useSettlement } from "@/context/settlement-context";

function TestComponent() {
  const {
    scenario,
    rail,
    useRealProver,
    status,
    selectScenario,
    selectRail,
    toggleRealProver,
    reset,
  } = useSettlement();

  return (
    <div>
      <span data-testid="scenario">{scenario ?? "null"}</span>
      <span data-testid="rail">{rail}</span>
      <span data-testid="useRealProver">{String(useRealProver)}</span>
      <span data-testid="status">{status}</span>
      <button onClick={() => selectScenario("food-recall")}>
        Select Food Recall
      </button>
      <button onClick={() => selectScenario("aid-voucher")}>
        Select Aid Voucher
      </button>
      <button onClick={() => selectRail("bitcoin")}>Select Bitcoin</button>
      <button onClick={() => selectRail("fiat")}>Select Fiat</button>
      <button onClick={toggleRealProver}>Toggle Prover</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}

describe("SettlementContext", () => {
  it("should throw error when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow("useSettlement must be used within SettlementProvider");

    consoleError.mockRestore();
  });

  it("should provide initial state", () => {
    render(
      <SettlementProvider>
        <TestComponent />
      </SettlementProvider>
    );

    expect(screen.getByTestId("scenario")).toHaveTextContent("null");
    expect(screen.getByTestId("rail")).toHaveTextContent("solana");
    expect(screen.getByTestId("useRealProver")).toHaveTextContent("false");
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("should select scenario", async () => {
    const user = userEvent.setup();
    render(
      <SettlementProvider>
        <TestComponent />
      </SettlementProvider>
    );

    await user.click(screen.getByText("Select Food Recall"));
    expect(screen.getByTestId("scenario")).toHaveTextContent("food-recall");

    await user.click(screen.getByText("Select Aid Voucher"));
    expect(screen.getByTestId("scenario")).toHaveTextContent("aid-voucher");
  });

  it("should select rail", async () => {
    const user = userEvent.setup();
    render(
      <SettlementProvider>
        <TestComponent />
      </SettlementProvider>
    );

    await user.click(screen.getByText("Select Bitcoin"));
    expect(screen.getByTestId("rail")).toHaveTextContent("bitcoin");

    await user.click(screen.getByText("Select Fiat"));
    expect(screen.getByTestId("rail")).toHaveTextContent("fiat");
  });

  it("should toggle real prover", async () => {
    const user = userEvent.setup();
    render(
      <SettlementProvider>
        <TestComponent />
      </SettlementProvider>
    );

    expect(screen.getByTestId("useRealProver")).toHaveTextContent("false");

    await user.click(screen.getByText("Toggle Prover"));
    expect(screen.getByTestId("useRealProver")).toHaveTextContent("true");

    await user.click(screen.getByText("Toggle Prover"));
    expect(screen.getByTestId("useRealProver")).toHaveTextContent("false");
  });

  it("should reset to initial state", async () => {
    const user = userEvent.setup();
    render(
      <SettlementProvider>
        <TestComponent />
      </SettlementProvider>
    );

    await user.click(screen.getByText("Select Food Recall"));
    await user.click(screen.getByText("Select Bitcoin"));
    await user.click(screen.getByText("Toggle Prover"));

    expect(screen.getByTestId("scenario")).toHaveTextContent("food-recall");
    expect(screen.getByTestId("rail")).toHaveTextContent("bitcoin");
    expect(screen.getByTestId("useRealProver")).toHaveTextContent("true");

    await user.click(screen.getByText("Reset"));

    expect(screen.getByTestId("scenario")).toHaveTextContent("null");
    expect(screen.getByTestId("rail")).toHaveTextContent("solana");
    expect(screen.getByTestId("useRealProver")).toHaveTextContent("false");
  });
});
