import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@arcmath/shared";
import { authOptions } from "@/lib/auth";
import { ImportPanel } from "@/app/admin/import/import-panel";

export default async function AdminImportPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fadmin%2Fimport");
  }

  if (!canAccessAdmin(session.user.role)) {
    redirect("/dashboard");
  }

  return (
    <main className="motion-rise">
      <ImportPanel />
    </main>
  );
}
