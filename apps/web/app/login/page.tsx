import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">The Room</h1>
        <p className="mt-1 text-sm text-zinc-500">One shared room for both companies. Sign in with your work email.</p>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          That sign-in link didn&apos;t work. It may have expired or been opened in a different browser. Send a new one.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
