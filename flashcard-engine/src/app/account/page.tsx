import { redirect } from "next/navigation";
import { AccountActions } from "@/app/account/account-actions";
import { LOCAL_DEFAULT_USER_ID, resolveServerUserId } from "@/lib/auth-user";
import { getSafeRuntimeConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const userId = await resolveServerUserId();
  if (!userId) {
    redirect("/login?next=/account");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      externalKey: true,
      createdAt: true,
    },
  });

  const loginLabel = formatLoginLabel(user?.externalKey ?? "");
  const runtimeConfig = getSafeRuntimeConfig();

  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Account
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Manage your login and data.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Sign in with the same Google account on any device to access the same
          decks, review history, and progress.
        </p>
      </header>

      <div className="mt-8 space-y-3 border border-[var(--line)] bg-[var(--panel)] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          Current User
        </p>
        <p className="text-sm">
          Login ID: <span className="font-medium">{loginLabel}</span>
        </p>
        <p className="text-xs text-[var(--ink-dim)]">
          Created: {user?.createdAt ? user.createdAt.toISOString().slice(0, 10) : "Unknown"}
        </p>
      </div>

      <AccountActions
        canDelete={userId !== LOCAL_DEFAULT_USER_ID}
        isGoogleAuthEnabled={runtimeConfig.googleAuthEnabled}
      />
    </section>
  );
}

function formatLoginLabel(externalKey: string): string {
  if (externalKey.startsWith("google-email:")) {
    return externalKey.slice("google-email:".length);
  }
  if (externalKey === "local-default") {
    return "Local default user";
  }
  return externalKey;
}
