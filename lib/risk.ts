import type { Exposure, TeamSelection } from "@/lib/types";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateExposure(teamA: number, teamB: number, multiplier: number): Exposure {
  const pool = teamA + teamB;
  const liabilityA = teamA * multiplier;
  const liabilityB = teamB * multiplier;
  return {
    teamA: money(teamA),
    teamB: money(teamB),
    pool: money(pool),
    liabilityA: money(liabilityA),
    liabilityB: money(liabilityB),
    balanceA: money(pool - liabilityA),
    balanceB: money(pool - liabilityB),
  };
}

export function projectExposure(current: Exposure, team: TeamSelection, amount: number, multiplier: number) {
  return calculateExposure(
    current.teamA + (team === "TEAM_A" ? amount : 0),
    current.teamB + (team === "TEAM_B" ? amount : 0),
    multiplier,
  );
}

export function calculatedReturn(amount: number, multiplier: number) {
  return money(amount * multiplier);
}
