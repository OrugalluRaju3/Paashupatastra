/** Owner daily hours are wall-clock in Asia/Kolkata (no DST). */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type ListingAvailability = {
  availabilityStartTime: string;
  availabilityEndTime: string;
  availableDays: string;
};

export type AvailabilityCheck =
  | { ok: true }
  | { ok: false; code: "INVALID_RANGE" | "OUTSIDE_AVAILABILITY"; message: string };

function parseHm(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatHm(totalMinutes: number): string {
  const mins = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Shift UTC instant so getUTC* yields Asia/Kolkata calendar fields. */
function asIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function istDayKey(date: Date): string {
  const d = asIst(date);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function istMinutesOfDay(date: Date): number {
  const d = asIst(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function istDayOfWeek(date: Date): number {
  // 0 = Sunday … 6 = Saturday (UTC methods on IST-shifted instant)
  return asIst(date).getUTCDay();
}

function startOfIstDay(date: Date): Date {
  const d = asIst(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MS,
  );
}

function addIstDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dayAllowed(availableDays: string, dow: number): boolean {
  const weekends = dow === 0 || dow === 6;
  if (availableDays === "weekdays") return !weekends;
  if (availableDays === "weekends") return weekends;
  return true; // all_days / unknown → allow
}

function dayLabel(availableDays: string): string {
  if (availableDays === "weekdays") return "weekdays (Mon–Fri)";
  if (availableDays === "weekends") return "weekends (Sat–Sun)";
  return "all days";
}

/**
 * True if every minute of [segStart, segEnd) (minutes-of-day, end exclusive,
 * may equal 24*60 for end-of-day) sits inside the owner's window.
 */
function segmentInsideWindow(
  segStart: number,
  segEnd: number,
  windowStart: number,
  windowEnd: number,
): boolean {
  if (segEnd <= segStart) return true;

  // Same-day window e.g. 06:00–22:00
  if (windowStart < windowEnd) {
    return segStart >= windowStart && segEnd <= windowEnd;
  }

  // Overnight window e.g. 22:00–06:00 → [22:00,24:00) ∪ [0:00,06:00]
  if (windowStart === windowEnd) {
    // Full day
    return true;
  }

  const inNight = (m: number) => m >= windowStart || m < windowEnd;
  // Continuous segment must lie wholly in one side, or bridge midnight only
  // within the overnight allowance.
  for (let m = segStart; m < segEnd; m++) {
    if (!inNight(m)) return false;
  }
  return true;
}

/**
 * Validates that [startAt, endAt) fits the listing's available days and daily hours.
 */
export function checkListingAvailability(
  listing: ListingAvailability,
  startAt: Date,
  endAt: Date,
): AvailabilityCheck {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    return { ok: false, code: "INVALID_RANGE", message: "Invalid check-in time" };
  }
  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    return { ok: false, code: "INVALID_RANGE", message: "Invalid check-out time" };
  }
  if (endAt.getTime() <= startAt.getTime()) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: "Check-out must be after check-in",
    };
  }

  const windowStart = parseHm(listing.availabilityStartTime);
  const windowEnd = parseHm(listing.availabilityEndTime);
  if (windowStart == null || windowEnd == null) {
    return {
      ok: false,
      code: "OUTSIDE_AVAILABILITY",
      message: "Listing availability hours are not configured",
    };
  }

  const days = listing.availableDays || "all_days";
  let cursor = startOfIstDay(startAt);
  const lastDay = startOfIstDay(endAt);

  while (cursor.getTime() <= lastDay.getTime()) {
    const next = addIstDays(cursor, 1);
    const segStartMs = Math.max(startAt.getTime(), cursor.getTime());
    const segEndMs = Math.min(endAt.getTime(), next.getTime());

    if (segEndMs > segStartMs) {
      const dow = istDayOfWeek(cursor);
      if (!dayAllowed(days, dow)) {
        return {
          ok: false,
          code: "OUTSIDE_AVAILABILITY",
          message: `This slot is only available on ${dayLabel(days)}`,
        };
      }

      const segStart =
        istDayKey(new Date(segStartMs)) === istDayKey(cursor)
          ? istMinutesOfDay(new Date(segStartMs))
          : 0;
      // If segment ends exactly at next midnight, treat as 24:00
      const segEnd =
        segEndMs >= next.getTime()
          ? 24 * 60
          : istMinutesOfDay(new Date(segEndMs));

      if (!segmentInsideWindow(segStart, segEnd, windowStart, windowEnd)) {
        return {
          ok: false,
          code: "OUTSIDE_AVAILABILITY",
          message: `Selected times must be within owner hours ${formatHm(windowStart)}–${formatHm(windowEnd)} (${dayLabel(days)})`,
        };
      }
    }

    cursor = next;
  }

  return { ok: true };
}

export function listingFitsAvailability(
  listing: ListingAvailability,
  startAt: Date,
  endAt: Date,
): boolean {
  return checkListingAvailability(listing, startAt, endAt).ok;
}
