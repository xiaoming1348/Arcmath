import { prisma } from "@arcmath/db";

async function main() {
  const result: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Class' ORDER BY column_name`
  );
  console.log('Class columns:');
  for (const r of result) console.log('  ' + r.column_name);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
