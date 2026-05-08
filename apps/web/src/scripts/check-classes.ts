import { prisma } from "@arcmath/db";

async function main() {
  const classes = await prisma.class.findMany({
    select: {
      id: true,
      name: true,
      joinCode: true,
      organization: { select: { name: true } },
      assignedTeacher: { select: { email: true, name: true } },
      createdByUser: { select: { email: true } },
      _count: { select: { enrollments: true, assignments: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  if (classes.length === 0) {
    console.log("No classes exist yet — admin or teacher needs to create one.");
  } else {
    console.log("Classes (most recent first):");
    for (const c of classes) {
      const teacher = c.assignedTeacher
        ? c.assignedTeacher.name ?? c.assignedTeacher.email
        : c.createdByUser?.email ?? "(no teacher)";
      console.log(
        `  ${c.organization?.name ?? "(no org)"} / "${c.name}"`
      );
      console.log(
        `    joinCode: ${c.joinCode ?? "(none)"} · teacher: ${teacher} · ${c._count.enrollments} students · ${c._count.assignments} assignments`
      );
    }
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
