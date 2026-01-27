/**
 * Formats company_hours rows into human-readable text for AI context.
 * Output is concise (≤700 chars) and grouped by consecutive days with same hours.
 * 
 * Example output:
 * BUSINESS HOURS (America/Chicago):
 * Mon–Fri: 9:00 AM – 5:00 PM
 * Sat: 10:00 AM – 2:00 PM
 * Sun: Closed
 */

interface CompanyHour {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Converts 24h time string (HH:MM) to 12h format (e.g., "9:00 AM")
 */
function formatTime12h(time24: string): string {
  const [hourStr, minStr] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const min = minStr || "00";
  
  if (hour === 0) return `12:${min} AM`;
  if (hour === 12) return `12:${min} PM`;
  if (hour > 12) return `${hour - 12}:${min} PM`;
  return `${hour}:${min} AM`;
}

/**
 * Groups consecutive days with identical hours for compact display.
 * Returns array like: [{ days: "Mon–Fri", hours: "9:00 AM – 5:00 PM" }]
 */
function groupConsecutiveDays(hours: CompanyHour[]): { days: string; hours: string }[] {
  // Sort by day_of_week (0=Sun, 1=Mon, ..., 6=Sat)
  const sorted = [...hours].sort((a, b) => a.day_of_week - b.day_of_week);
  
  const groups: { days: string; hours: string }[] = [];
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;
  let currentHoursKey = "";

  const pushGroup = () => {
    if (rangeStart !== null && rangeEnd !== null) {
      const daysStr = rangeStart === rangeEnd
        ? DAY_ABBREV[rangeStart]
        : `${DAY_ABBREV[rangeStart]}–${DAY_ABBREV[rangeEnd]}`;
      groups.push({ days: daysStr, hours: currentHoursKey });
    }
  };

  for (const h of sorted) {
    const hoursKey = h.is_closed
      ? "Closed"
      : `${formatTime12h(h.open_time)} – ${formatTime12h(h.close_time)}`;

    // Check if this continues the current range
    if (
      rangeEnd !== null &&
      h.day_of_week === rangeEnd + 1 &&
      hoursKey === currentHoursKey
    ) {
      rangeEnd = h.day_of_week;
    } else {
      // Push previous group and start new one
      pushGroup();
      rangeStart = h.day_of_week;
      rangeEnd = h.day_of_week;
      currentHoursKey = hoursKey;
    }
  }
  
  // Push final group
  pushGroup();

  return groups;
}

/**
 * Formats company hours for AI prompt context.
 * 
 * @param hours - Array of company_hours rows from database
 * @param timezone - Company timezone (e.g., "America/Chicago")
 * @returns Formatted string ready for AI context (≤700 chars)
 */
export function formatCompanyHoursForAI(
  hours: CompanyHour[],
  timezone: string
): string {
  if (!hours || hours.length === 0) {
    return `BUSINESS HOURS (${timezone}):\nNot configured`;
  }

  const groups = groupConsecutiveDays(hours);
  
  const lines = groups.map(g => `${g.days}: ${g.hours}`);
  
  // Add closed days that aren't in the data
  const daysPresent = new Set(hours.map(h => h.day_of_week));
  const missingDays: number[] = [];
  for (let d = 0; d < 7; d++) {
    if (!daysPresent.has(d)) {
      missingDays.push(d);
    }
  }
  
  // Group missing days as Closed
  if (missingDays.length > 0) {
    const missingRanges: string[] = [];
    let start = missingDays[0];
    let end = missingDays[0];
    
    for (let i = 1; i <= missingDays.length; i++) {
      if (i < missingDays.length && missingDays[i] === end + 1) {
        end = missingDays[i];
      } else {
        const rangeStr = start === end
          ? DAY_ABBREV[start]
          : `${DAY_ABBREV[start]}–${DAY_ABBREV[end]}`;
        missingRanges.push(rangeStr);
        if (i < missingDays.length) {
          start = missingDays[i];
          end = missingDays[i];
        }
      }
    }
    
    lines.push(`${missingRanges.join(", ")}: Closed`);
  }

  const result = `BUSINESS HOURS (${timezone}):\n${lines.join("\n")}`;
  
  // Ensure we stay under 700 chars
  if (result.length > 700) {
    return result.substring(0, 697) + "...";
  }
  
  return result;
}
