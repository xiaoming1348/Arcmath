-- Admissions-track expansion (2026-Q2 pilot pivot):
-- Add UK/Canada admissions contests — Euclid (CEMC/Waterloo), MAT
-- (Oxford + Imperial), STEP (Cambridge). Plus WORKED_SOLUTION answer
-- format for long-form questions we intentionally do NOT send through the
-- Lean proof verifier (see schema.prisma comments on AnswerFormat).
ALTER TYPE "Contest" ADD VALUE 'EUCLID';
ALTER TYPE "Contest" ADD VALUE 'MAT';
ALTER TYPE "Contest" ADD VALUE 'STEP';

ALTER TYPE "AnswerFormat" ADD VALUE 'WORKED_SOLUTION';
