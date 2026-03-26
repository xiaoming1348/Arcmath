import type { Contest } from "@arcmath/db";

export type RealTutorSetStatus = "live" | "planned";

export type RealTutorSetRolloutEntry = {
  contest: Contest;
  year: number;
  exam: string | null;
  status: RealTutorSetStatus;
};

// Keep this list intentionally small and explicit. Real sets only become
// product-visible when they have been imported, reviewed, and marked "live".
export const REAL_TUTOR_SET_ROLLOUT: RealTutorSetRolloutEntry[] = [
  {
    contest: "AMC8",
    year: 2015,
    exam: null,
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2015,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2015,
    exam: "A",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2015,
    exam: "I",
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2013,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC8",
    year: 2016,
    exam: null,
    status: "live"
  },
  {
    contest: "AMC8",
    year: 2017,
    exam: null,
    status: "live"
  },
  {
    contest: "AMC8",
    year: 2018,
    exam: null,
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2016,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2016,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2017,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2018,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC8",
    year: 2019,
    exam: null,
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2019,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2019,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2020,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2020,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC10",
    year: 2021,
    exam: "A",
    status: "live"
  },
  {
    contest: "AMC12",
    year: 2021,
    exam: "A",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2021,
    exam: "I",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2016,
    exam: "I",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2017,
    exam: "I",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2018,
    exam: "I",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2019,
    exam: "I",
    status: "live"
  },
  {
    contest: "AIME",
    year: 2020,
    exam: "I",
    status: "live"
  },
  {
    contest: "AMC8",
    year: 2022,
    exam: null,
    status: "planned"
  },
  {
    contest: "AMC10",
    year: 2022,
    exam: "A",
    status: "planned"
  },
  {
    contest: "AMC12",
    year: 2022,
    exam: "A",
    status: "planned"
  },
  {
    contest: "AIME",
    year: 2022,
    exam: "I",
    status: "planned"
  }
];

export function getRealTutorRolloutEntries(status?: RealTutorSetStatus): RealTutorSetRolloutEntry[] {
  if (!status) {
    return REAL_TUTOR_SET_ROLLOUT;
  }

  return REAL_TUTOR_SET_ROLLOUT.filter((entry) => entry.status === status);
}
