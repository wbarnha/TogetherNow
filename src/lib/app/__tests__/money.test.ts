import { describe, expect, it } from "vitest";
import { balances, expenseBalance, myShareFraction } from "../money";
import type { Expense } from "../types";

const base: Expense = {
  id: "e1",
  title: "Flights",
  amount: 200,
  currency: "USD",
  date: "2026-01-01",
  paidBy: "me",
  split: "even",
  category: "travel",
  settled: false,
  updatedAt: 0,
};

describe("myShareFraction", () => {
  it("splits evenly by default", () => {
    expect(myShareFraction(base)).toBe(0.5);
  });
  it("honours custom percentages and clamps them", () => {
    expect(myShareFraction({ ...base, split: "custom", myPercent: 70 })).toBeCloseTo(0.7);
    expect(myShareFraction({ ...base, split: "custom", myPercent: 250 })).toBe(1);
  });
  it("handles one-sided splits", () => {
    expect(myShareFraction({ ...base, split: "mine" })).toBe(1);
    expect(myShareFraction({ ...base, split: "theirs" })).toBe(0);
  });
});

describe("expenseBalance", () => {
  it("is positive when I paid and we split", () => {
    expect(expenseBalance(base)).toBe(100);
  });
  it("is negative when they paid", () => {
    expect(expenseBalance({ ...base, paidBy: "them" })).toBe(-100);
  });
  it("is zero when the payer owns the whole cost", () => {
    expect(expenseBalance({ ...base, split: "mine" })).toBe(0);
  });
});

describe("balances", () => {
  it("nets per currency and skips settled rows", () => {
    const rows = balances([
      base,
      { ...base, id: "e2", paidBy: "them", amount: 60 },
      { ...base, id: "e3", currency: "EUR", amount: 40 },
      { ...base, id: "e4", amount: 999, settled: true },
    ]);
    const usd = rows.find((r) => r.currency === "USD")!;
    const eur = rows.find((r) => r.currency === "EUR")!;
    expect(usd.net).toBe(70);
    expect(usd.paidByMe).toBe(200);
    expect(usd.paidByThem).toBe(60);
    expect(eur.net).toBe(20);
  });
});
