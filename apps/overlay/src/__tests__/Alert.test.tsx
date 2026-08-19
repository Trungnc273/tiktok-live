import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "../Alert.js";

describe("Alert component", () => {
  it("render đúng title và subtitle", () => {
    render(<Alert content={{ title: "abc tặng Rose x1!", subtitle: "1 diamond", className: "alert alert-gift" }} />);
    expect(screen.getByText("abc tặng Rose x1!")).toBeTruthy();
    expect(screen.getByText("1 diamond")).toBeTruthy();
  });

  it("không render subtitle khi không có", () => {
    render(<Alert content={{ title: "abc vừa follow!", className: "alert alert-follow" }} />);
    expect(screen.getByTestId("alert").textContent).toBe("abc vừa follow!");
  });
});
