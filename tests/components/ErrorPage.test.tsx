// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";

afterEach(cleanup);

describe("app/error.tsx (route error boundary)", () => {
  it("shows a Korean message and a retry button, never the error's message, digest or stack", async () => {
    const error = Object.assign(new Error("MongoServerSelectionError secret-db.internal:27017"), { digest: "DIGEST123" });
    const retry = vi.fn();
    const reset = vi.fn();
    const { container } = render(<ErrorPage error={error} retry={retry} reset={reset} />);

    expect(screen.getByRole("alert").textContent).toContain("문제가 발생했습니다");
    const html = container.innerHTML;
    const stackFrame = error.stack!.split("\n")[1].trim();
    for (const leak of ["secret-db", "MongoServerSelectionError", "DIGEST123", stackFrame]) expect(html).not.toContain(leak);

    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
