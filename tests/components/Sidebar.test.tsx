// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(cleanup);

const user = { username: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4" };

describe("Sidebar user menu", () => {
  it("shows the logged-in user's avatar and username", () => {
    render(<Sidebar user={user} />);
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const avatar = within(nav).getByRole("img", { name: "octocat 아바타" });
    expect(avatar.getAttribute("src")).toBe(user.avatarUrl);
    expect(within(nav).getByText("octocat")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "대시보드" }).getAttribute("aria-current")).toBe("page");
  });

  it("has a logout button that POSTs a form to /auth/logout", () => {
    render(<Sidebar user={user} />);
    const button = screen.getByRole("button", { name: "로그아웃" });
    expect(button.getAttribute("type")).toBe("submit");
    const form = button.closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/logout");
  });

  it("renders no image when the user has no avatar", () => {
    render(<Sidebar user={{ username: "no-avatar", avatarUrl: "" }} />);
    expect(screen.getByText("no-avatar")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows no user, logout button or menu links when logged out", () => {
    render(<Sidebar user={null} />);
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByText("칸반 목표 할 일")).toBeTruthy();
    expect(within(nav).queryByRole("button")).toBeNull();
    expect(within(nav).queryByRole("img")).toBeNull();
    expect(within(nav).queryAllByRole("link")).toHaveLength(0);
  });
});
