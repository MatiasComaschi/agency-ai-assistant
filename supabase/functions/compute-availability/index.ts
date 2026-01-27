import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface AvailabilitySlot {
  start_datetime: string;
  end_datetime: string;
  staff_id?: string;
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
    const { company_id, service_id, staff_id, start_range, end_range } = await req.json();

    if (!company_id || !service_id || !start_range || !end_range) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: company_id, service_id, start_range, end_range" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[compute-availability] Request:", { company_id, service_id, staff_id, start_range, end_range });

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

    // Get staff who can perform this service
    let staffQuery = supabase
      .from("service_staff")
      .select("staff_id")
      .eq("service_id", service_id);

    const { data: serviceStaff, error: serviceStaffError } = await staffQuery;

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
        // Check if staff is active and can do this service
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

    // Fetch existing confirmed appointments in range
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
    const slotInterval = 30; // Generate slots every 30 minutes

    const startDate = new Date(start_range);
    const endDate = new Date(end_range);
    const now = new Date();

    // Iterate through each day in the range
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = currentDate.toISOString().split("T")[0];

      // For each eligible staff member
      for (const staffId of eligibleStaffIds) {
        // Find staff hours for this day
        const hoursForDay = staffHours.find(
          (h) => h.staff_id === staffId && h.day_of_week === dayOfWeek
        );

        if (!hoursForDay) {
          continue; // Staff doesn't work this day
        }

        // Parse start and end times
        const [startHour, startMin] = hoursForDay.start_time.split(":").map(Number);
        const [endHour, endMin] = hoursForDay.end_time.split(":").map(Number);

        const dayStart = new Date(currentDate);
        dayStart.setHours(startHour, startMin, 0, 0);

        const dayEnd = new Date(currentDate);
        dayEnd.setHours(endHour, endMin, 0, 0);

        // Generate slots within working hours
        let slotStart = new Date(dayStart);

        while (slotStart < dayEnd) {
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

          // Skip if slot end exceeds working hours
          if (slotEnd > dayEnd) break;

          // Skip if slot is in the past
          if (slotStart < now) {
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
    }

    // Sort slots by datetime
    slots.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());

    console.log("[compute-availability] Found", slots.length, "slots");

    return new Response(
      JSON.stringify({ slots }),
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
