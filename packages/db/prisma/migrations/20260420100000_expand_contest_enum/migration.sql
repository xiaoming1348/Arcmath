-- Expand Contest enum with proof-based and olympiad-level competitions
ALTER TYPE "Contest" ADD VALUE 'USAMO';
ALTER TYPE "Contest" ADD VALUE 'USAJMO';
ALTER TYPE "Contest" ADD VALUE 'IMO';
ALTER TYPE "Contest" ADD VALUE 'CMO';
ALTER TYPE "Contest" ADD VALUE 'PUTNAM';
