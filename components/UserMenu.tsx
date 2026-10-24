import Image from "next/image";

export type NavUser = { username: string; avatarUrl: string };

/**
 * Logged-in user in the nav: GitHub avatar + username and a logout button. Logout is a plain HTML
 * form POST to /auth/logout (works without JavaScript; the route answers 303 → /login).
 */
export function UserMenu({ user }: { user: NavUser }) {
  return (
    <div className="user-menu">
      <span className="user-name">
        {/* GitHub avatar URLs are already-sized external images: served as-is (no optimizer, no remotePatterns). */}
        {user.avatarUrl && (
          <Image className="avatar" src={user.avatarUrl} alt={`${user.username} 아바타`} width={28} height={28} unoptimized />
        )}
        <span>{user.username}</span>
      </span>
      <form method="post" action="/auth/logout">
        <button type="submit">로그아웃</button>
      </form>
    </div>
  );
}
