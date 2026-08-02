export type CommissionLike = {
  commissionBps: number;
  platformFeeFlatPaise: number;
  taxBps: number;
};

export function calcDurationMinutes(startAt: Date, endAt: Date): number {
  return Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / 60000));
}

export function calcParkingQuote(input: {
  rentType: string;
  priceInPaise: number;
  startAt: Date;
  endAt: Date;
  commission: CommissionLike;
}) {
  const durationMinutes = calcDurationMinutes(input.startAt, input.endAt);
  const hours = durationMinutes / 60;
  const days = hours / 24;

  let base = 0;
  if (input.rentType === "hourly") {
    base = Math.ceil(hours) * input.priceInPaise;
  } else if (input.rentType === "daily") {
    base = Math.ceil(days) * input.priceInPaise;
  } else {
    // monthly: prorate by days / 30
    base = Math.max(1, Math.ceil(days / 30)) * input.priceInPaise;
  }

  const platformFee =
    input.commission.platformFeeFlatPaise +
    Math.round((base * input.commission.commissionBps) / 10000);
  const tax = Math.round(((base + platformFee) * input.commission.taxBps) / 10000);
  const total = base + platformFee + tax;

  return {
    durationMinutes,
    baseAmountInPaise: base,
    platformFeeInPaise: platformFee,
    taxInPaise: tax,
    totalAmountInPaise: total,
  };
}
