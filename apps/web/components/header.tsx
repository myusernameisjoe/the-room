import Link from "next/link";

export function Header({ name }: { name?: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <Link href="/" className="font-semibold">
        The Room
      </Link>
      <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
        {name && <span className="text-zinc-500">{name}</span>}
        <button type="submit" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          Sign out
        </button>
      </form>
    </header>
  );
}
