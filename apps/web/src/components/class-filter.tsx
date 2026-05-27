"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

/**
 * Dropdown that filters /org/students by class via the `?classId=...`
 * URL parameter. Selecting "All classes" clears the parameter.
 *
 * Server-side reads `searchParams.classId` and adjusts the query;
 * we just own URL state here, no client-side data fetching.
 */
export function ClassFilter({
  classes,
  selectedClassId,
  labels
}: {
  classes: Array<{ id: string; name: string }>;
  selectedClassId: string | null;
  labels: {
    label: string;
    all: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("classId", e.target.value);
    } else {
      params.delete("classId");
    }
    const qs = params.toString();
    // startTransition keeps the page from looking frozen during
    // server-component re-render after the navigation.
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <label
      className="inline-flex items-center gap-2 text-sm"
      style={{ color: "var(--muted)" }}
    >
      <span>{labels.label}:</span>
      <select
        value={selectedClassId ?? ""}
        onChange={onChange}
        className="rounded border px-2 py-1 text-sm"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--foreground)"
        }}
      >
        <option value="">{labels.all}</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
