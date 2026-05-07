// assets/js/booking-logic.js

async function getAvailableSlots(salonId, serviceDuration, selectedDate) {
  if (!salonId || !serviceDuration || !selectedDate) return [];

  const dayOfWeek = new Date(selectedDate + "T00:00:00").getDay();

  const { data: hours, error: hoursError } = await window.db
    .from("working_hours")
    .select("*")
    .eq("salon_id", salonId)
    .eq("day_of_week", dayOfWeek)
    .maybeSingle();

  if (hoursError) {
    console.error("Greška radno vreme:", hoursError);
    return [];
  }

  if (!hours || hours.is_closed) return [];

  const openTime = String(hours.open_time || "09:00").slice(0, 5);
  const closeTime = String(hours.close_time || "17:00").slice(0, 5);

  const { data: existing, error: existingError } = await window.db
    .from("appointments")
    .select("appointment_time, duration_snapshot")
    .eq("salon_id", salonId)
    .eq("appointment_date", selectedDate)
    .in("status", ["new", "confirmed"]);

  if (existingError) {
    console.error("Greška termini:", existingError);
    return [];
  }

  const allSlots = generateTimeSlots(openTime, closeTime, 30);
  return allSlots.filter(slot => canFitSlot(slot, Number(serviceDuration), closeTime, existing || []));
}

function canFitSlot(slotStart, serviceDuration, closeTime, existingAppointments) {
  const start = timeToMinutes(slotStart);
  const end = start + Number(serviceDuration);
  const close = timeToMinutes(closeTime);

  if (end > close) return false;

  for (const appointment of existingAppointments) {
    const bookedStart = timeToMinutes(String(appointment.appointment_time || "00:00").slice(0, 5));
    const bookedDuration = Number(appointment.duration_snapshot || 30);
    const bookedEnd = bookedStart + bookedDuration;
    if (start < bookedEnd && end > bookedStart) return false;
  }

  return true;
}

function generateTimeSlots(openTime, closeTime, stepMinutes = 30) {
  const slots = [];
  let current = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  while (current < close) {
    slots.push(minutesToTime(current));
    current += stepMinutes;
  }
  return slots;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

window.BookingLogic = { getAvailableSlots, canFitSlot, generateTimeSlots, timeToMinutes, minutesToTime };
