import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface AvailabilitySlot {
  start_datetime: string;
  end_datetime: string;
  staff_id: string;
}

interface StaffHours {
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface StaffTimeOff {
  staff_id: string;
  start_datetime: string;
  end_datetime: string;
}

interface Appointment {
  staff_id: string | null;
  start_datetime: string;
  end_datetime: string;
  status: string;
}

interface Company {
  id: string;
  timezone: string;
}

/**
 * Convert a Date to a local date string (YYYY-MM-DD) in the given timezone.
 */
function toLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone }); // en-CA gives YYYY-MM-DD
}

/**
 * Get the day of week (0-6, Sunday=0) for a date in the given timezone.
 */
function getLocalDayOfWeek(date: Date, timezone: string): number {
  const localDateStr = date.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short" });
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dayMap[localDateStr.slice(0, 3)] ?? 0;
}

/**
 * Parse a local time string (HH:MM or HH:MM:SS) and a date string (YYYY-MM-DD) 
 * into a Date object representing that local time in the given timezone.
 */
function parseLocalDateTime(dateStr: string, timeStr: string, timezone: string): Date {
  // Create a datetime string and parse it as if it's in the target timezone
  const datetimeStr = `${dateStr}T${timeStr}`;
  
  // Use Intl.DateTimeFormat to get the UTC offset for this timezone at this date
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  // Parse the datetime string as local time
  const [year, month, day] = dateStr.split("-").map(Number);
  const timeParts = timeStr.split(":").map(Number);
  const hour = timeParts[0] || 0;
  const minute = timeParts[1] || 0;
  const second = timeParts[2] || 0;
  
  // Create a date in the timezone by finding the UTC equivalent
  // This is approximate but works for slot generation
  const localDate = new Date(year, month - 1, day, hour, minute, second);
  
  // Get the offset difference
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const tzOffset = getTimezoneOffsetMinutes(utcDate, timezone);
  
  return new Date(utcDate.getTime() + tzOffset * 60 * 1000);
}

/**
 * Get timezone offset in minutes (positive = behind UTC, negative = ahead)
 */
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

/**
 * Validate UUID format
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validate ISO datetime string
 */
function isValidISODate(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { company_id, service_id, staff_id, start_range, end_range } = body as {
      company_id?: string;
      service_id?: string;
      staff_id?: string;
      start_range?: string;
      end_range?: string;
    };

    // Input validation
    if (!company_id || !service_id || !start_range || !end_range) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required parameters", 
          details: "Required: company_id, service_id, start_range, end_range" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(company_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid company_id format (must be UUID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidUUID(service_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid service_id format (must be UUID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (staff_id && !isValidUUID(staff_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid staff_id format (must be UUID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidISODate(start_range)) {
      return new Response(
        JSON.stringify({ error: "Invalid start_range format (must be ISO datetime)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidISODate(end_range)) {
      return new Response(
        JSON.stringify({ error: "Invalid end_range format (must be ISO datetime)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[compute-availability] Request:", { company_id, service_id, staff_id, start_range, end_range });

    // Fetch company to get timezone
    const { data: companyData, error: companyError } = await supabase
      .from("companies")
      .select("id, timezone")
      .eq("id", company_id)
      .single();

    if (companyError || !companyData) {
      console.error("[compute-availability] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const company = companyData as Company;
    const timezone = company.timezone || "America/New_York";
    console.log("[compute-availability] Using timezone:", timezone);

    // Fetch service to get duration
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, duration_minutes")
      .eq("id", service_id)
      .eq("company_id", company_id)
      .eq("is_active", true)
      .single();

    if (serviceError || !service) {
      return new Response(
        JSON.stringify({ error: "Service not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const durationMinutes = service.duration_minutes;
    const slotInterval = 15; // Generate slots every 15 minutes

    // Get staff who can perform this service
    const { data: serviceStaff, error: serviceStaffError } = await supabase
      .from("service_staff")
      .select("staff_id")
      .eq("service_id", service_id);

    if (serviceStaffError) {
      console.error("[compute-availability] Error fetching service_staff:", serviceStaffError);
      return new Response(
        JSON.stringify({ error: "Error fetching service staff mappings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If staff_id is specified, filter to that staff only
    let eligibleStaffIds: string[] = (serviceStaff || []).map((s) => s.staff_id);
    
    if (staff_id) {
      if (!eligibleStaffIds.includes(staff_id)) {
        return new Response(
          JSON.stringify({ slots: [], message: "Specified staff cannot perform this service" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      eligibleStaffIds = [staff_id];
    }

    // If no staff assigned to service, return empty
    if (eligibleStaffIds.length === 0) {
      return new Response(
        JSON.stringify({ slots: [], message: "No staff assigned to this service" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify staff are active
    const { data: activeStaff, error: activeStaffError } = await supabase
      .from("staff")
      .select("id")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .in("id", eligibleStaffIds);

    if (activeStaffError) {
      console.error("[compute-availability] Error fetching active staff:", activeStaffError);
      return new Response(
        JSON.stringify({ error: "Error fetching staff" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    eligibleStaffIds = (activeStaff || []).map((s) => s.id);

    if (eligibleStaffIds.length === 0) {
      return new Response(
        JSON.stringify({ slots: [], message: "No active staff available for this service" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch staff hours for eligible staff
    const { data: staffHoursData, error: staffHoursError } = await supabase
      .from("staff_hours")
      .select("staff_id, day_of_week, start_time, end_time")
      .in("staff_id", eligibleStaffIds);

    if (staffHoursError) {
      console.error("[compute-availability] Error fetching staff_hours:", staffHoursError);
      return new Response(
        JSON.stringify({ error: "Error fetching staff hours" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffHours: StaffHours[] = (staffHoursData || []) as StaffHours[];

    // Fetch time off for eligible staff within range
    const { data: timeOffData, error: timeOffError } = await supabase
      .from("staff_time_off")
      .select("staff_id, start_datetime, end_datetime")
      .in("staff_id", eligibleStaffIds)
      .lte("start_datetime", end_range)
      .gte("end_datetime", start_range);

    if (timeOffError) {
      console.error("[compute-availability] Error fetching staff_time_off:", timeOffError);
    }

    const timeOffs: StaffTimeOff[] = (timeOffData || []) as StaffTimeOff[];

    // Fetch existing confirmed appointments in range for this company
    const { data: appointmentsData, error: appointmentsError } = await supabase
      .from("appointments")
      .select("staff_id, start_datetime, end_datetime, status")
      .eq("company_id", company_id)
      .eq("status", "confirmed")
      .lte("start_datetime", end_range)
      .gte("end_datetime", start_range);

    if (appointmentsError) {
      console.error("[compute-availability] Error fetching appointments:", appointmentsError);
    }

    const appointments: Appointment[] = (appointmentsData || []) as Appointment[];

    // TODO: Fetch external calendar busy times if calendar is connected
    // This would require calling the calendar provider API
    // For now, we only check internal data

    // Generate slots
    const slots: AvailabilitySlot[] = [];

    const startDate = new Date(start_range);
    const endDate = new Date(end_range);
    const now = new Date();

    // Iterate through each day in the range
    const currentDate = new Date(startDate);
    
    // Set to start of day in UTC
    currentDate.setUTCHours(0, 0, 0, 0);

    const maxDays = 90; // Safety limit
    let daysProcessed = 0;

    while (currentDate <= endDate && daysProcessed < maxDays) {
      // Get the local date string for this day in company timezone
      const localDateStr = toLocalDateString(currentDate, timezone);
      const dayOfWeek = getLocalDayOfWeek(currentDate, timezone);

      // For each eligible staff member
      for (const staffId of eligibleStaffIds) {
        // Find staff hours for this day
        const hoursForDay = staffHours.find(
          (h) => h.staff_id === staffId && h.day_of_week === dayOfWeek
        );

        if (!hoursForDay) {
          continue; // Staff doesn't work this day
        }

        // Parse start and end times in company timezone
        const dayStart = parseLocalDateTime(localDateStr, hoursForDay.start_time, timezone);
        const dayEnd = parseLocalDateTime(localDateStr, hoursForDay.end_time, timezone);

        // Generate slots within working hours
        let slotStart = new Date(dayStart);

        while (slotStart < dayEnd) {
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

          // Skip if slot end exceeds working hours
          if (slotEnd > dayEnd) break;

          // Skip if slot is in the past (with 5 minute buffer)
          if (slotStart.getTime() < now.getTime() + 5 * 60 * 1000) {
            slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
            continue;
          }

          // Skip if outside requested range
          if (slotStart < startDate || slotEnd > endDate) {
            slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
            continue;
          }

          // Check for time off conflicts
          const hasTimeOffConflict = timeOffs.some((to) => {
            if (to.staff_id !== staffId) return false;
            const toStart = new Date(to.start_datetime);
            const toEnd = new Date(to.end_datetime);
            return slotStart < toEnd && slotEnd > toStart;
          });

          if (hasTimeOffConflict) {
            slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
            continue;
          }

          // Check for appointment conflicts
          const hasAppointmentConflict = appointments.some((apt) => {
            if (apt.staff_id !== staffId) return false;
            const aptStart = new Date(apt.start_datetime);
            const aptEnd = new Date(apt.end_datetime);
            return slotStart < aptEnd && slotEnd > aptStart;
          });

          if (hasAppointmentConflict) {
            slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
            continue;
          }

          // Slot is available!
          slots.push({
            start_datetime: slotStart.toISOString(),
            end_datetime: slotEnd.toISOString(),
            staff_id: staffId,
          });

          slotStart = new Date(slotStart.getTime() + slotInterval * 60 * 1000);
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      daysProcessed++;
    }

    // Sort slots by datetime, then by staff_id for consistency
    slots.sort((a, b) => {
      const timeDiff = new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.staff_id.localeCompare(b.staff_id);
    });

    console.log("[compute-availability] Found", slots.length, "slots for", eligibleStaffIds.length, "staff members");

    return new Response(
      JSON.stringify({ 
        slots,
        timezone,
        staff_count: eligibleStaffIds.length,
        duration_minutes: durationMinutes
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[compute-availability] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
