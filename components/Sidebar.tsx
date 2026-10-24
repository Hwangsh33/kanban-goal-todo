"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu, type NavUser } from "./UserMenu";

const ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/todos", label: "할일" },
  { href: "/plans", label: "주간계획" },
  { href: "/goals", label: "1년 목표" },
];

/** Main nav. `user` is the logged-in user (null on /login and for logged-out visitors). */
export function Sidebar({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav className="sidebar" aria-label="주 메뉴">
      <span className="brand">칸반 목표 할 일</span>
      {user && (
        <>
          {ITEMS.map((i) => link(i.href, i.label))}
          <div className="sidebar-foot">
            {link("/trash", "휴지통")}
            <UserMenu user={user} />
          </div>
        </>
      )}
    </nav>
  );
}
