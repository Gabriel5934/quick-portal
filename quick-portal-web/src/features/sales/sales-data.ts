const monthNames = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function hashName(name: string): number {
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number) {
  return Math.round(min + random() * (max - min));
}

export function generateSalesDashboard(name: string) {
  const random = seededRandom(hashName(name));
  const yearlySales = monthNames.map((month) => ({
    month,
    sales: randomBetween(random, 1_500_000, 12_000_000),
  }));
  const currentMonthSales = yearlySales[new Date().getMonth()].sales;
  const todaySales = randomBetween(random, 80_000, 850_000);

  return {
    currentMonthSales,
    todayCommission: Math.round(todaySales * (0.018 + random() * 0.032)),
    todayReceivable: Math.round(todaySales * (0.82 + random() * 0.14)),
    todaySales,
    yearlySales,
  };
}
