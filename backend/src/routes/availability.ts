import express, { Request, Response } from "express";
import * as db from "../database";
import { transaction } from "../database";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { zonedTimeToUtc } from "../utils/timezone";
import { requireRole } from "../middleware/requireRole";

const router = express.Router();

// Get mentor's availability
router.get(
  "/mentor/:mentorId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { mentorId } = req.params;

      const result = await db.query(
        `SELECT * FROM mentor_availability
       WHERE mentor_id = $1
       ORDER BY day_of_week, start_time`,
        [mentorId],
      );

      const mentor = await db.query(
        "SELECT COALESCE(timezone, 'UTC') as timezone FROM users WHERE id = $1",
        [mentorId],
      );

      if (mentor.rows.length === 0) {
        return res.status(404).json({
          error: "Mentor not found",
        });
      }

      res.json({
        success: true,
        data: result.rows,
        timezone: mentor.rows[0]?.timezone || "UTC",
      });
    } catch (error) {
      console.error("Error fetching availability:", error);
      res.status(500).json({ error: "Failed to fetch availability" });
    }
  },
);

// HH:MM (24h) format, used to validate slot times.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Set availability slots (mentors only)
router.post(
  "/mentor/slots",
  authMiddleware,
  requireRole("mentor"),
  async (req: Request, res: Response) => {
    try {
      const { slots } = req.body;
      const userId = (req as any).user.id;

      if (!Array.isArray(slots)) {
        return res.status(400).json({ error: "slots must be an array" });
      }

      // Validate every slot up-front so a bad payload is a 400, never a partial
      // write followed by a 500.
      for (const slot of slots) {
        if (!slot || typeof slot !== "object") {
          return res.status(400).json({ error: "Each slot must be an object" });
        }
        const { dayOfWeek, startTime, endTime } = slot;
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          return res
            .status(400)
            .json({ error: "dayOfWeek must be an integer between 0 and 6" });
        }
        if (
          typeof startTime !== "string" ||
          !TIME_RE.test(startTime) ||
          typeof endTime !== "string" ||
          !TIME_RE.test(endTime)
        ) {
          return res
            .status(400)
            .json({ error: "startTime and endTime must be in HH:MM format" });
        }
        if (startTime >= endTime) {
          return res
            .status(400)
            .json({ error: "startTime must be before endTime" });
        }
      }

      // Prevent overlapping slots for the same day
      const slotsByDay = new Map<number, typeof slots>();

      for (const slot of slots) {
        if (!slotsByDay.has(slot.dayOfWeek)) {
          slotsByDay.set(slot.dayOfWeek, []);
        }

        slotsByDay.get(slot.dayOfWeek)!.push(slot);
      }

      for (const [day, daySlots] of slotsByDay.entries()) {
        daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

        for (let i = 1; i < daySlots.length; i++) {
          const previous = daySlots[i - 1];
          const current = daySlots[i];

          if (current.startTime < previous.endTime) {
            return res.status(400).json({
              error: `Overlapping availability slots detected for day ${day}`,
            });
          }
        }
      }

      await transaction(async (client) => {
        // Delete existing slots
        await client.query(
          "DELETE FROM mentor_availability WHERE mentor_id = $1",
          [userId]
        );

        // Insert new slots
        for (const slot of slots) {
          const { dayOfWeek, startTime, endTime } = slot;

          await client.query(
            `INSERT INTO mentor_availability
        (mentor_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)`,
            [userId, dayOfWeek, startTime, endTime]
          );
        }
      });

      res.json({
        success: true,
        message: "Availability updated successfully",
      });
    } catch (error) {
      console.error("Error updating availability:", error);
      res.status(500).json({ error: "Failed to update availability" });
    }
  },
);

// Get available time slots for booking
router.get("/available/:mentorId", async (req: Request, res: Response) => {
  try {
    const { mentorId } = req.params;
    const { date } = req.query;

    if (typeof date !== "string" || !date.trim()) {
      return res.status(400).json({
        error: "date query parameter is required",
      });
    }

    // Validate YYYY-MM-DD format
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (!DATE_RE.test(date)) {
      return res.status(400).json({
        error: "date must be in YYYY-MM-DD format",
      });
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        error: "Invalid date",
      });
    }

    const mentorRow = await db.query(
      `SELECT id, timezone
   FROM users
   WHERE id = $1`,
      [mentorId],
    );

    if (mentorRow.rows.length === 0) {
      return res.status(404).json({
        error: "Mentor not found",
      });
    }

    const mentorTimezone = mentorRow.rows[0].timezone || "UTC";

    const dayOfWeek = zonedTimeToUtc(date, "12:00", mentorTimezone).getUTCDay();
    const availabilityResult = await db.query(
      `SELECT start_time, end_time FROM mentor_availability
       WHERE mentor_id = $1 AND day_of_week = $2`,
      [mentorId, dayOfWeek],
    );

    if (availabilityResult.rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        slots: [],
        timezone: mentorTimezone,
      });
    }

    // Get booked sessions for this date
    const bookedResult = await db.query(
      `SELECT scheduled_at, INTERVAL '1 hour' as duration
       FROM sessions
       WHERE mentor_id = $1 AND DATE(scheduled_at) = $2`,
      [mentorId, date],
    );

    const bookedTimes = bookedResult.rows.map((r: any) =>
      new Date(r.scheduled_at).getTime(),
    );
    const slots: string[] = [];

    for (const availability of availabilityResult.rows) {
      const start = zonedTimeToUtc(
        date as string,
        availability.start_time.slice(0, 5),
        mentorTimezone,
      );

      const end = zonedTimeToUtc(
        date as string,
        availability.end_time.slice(0, 5),
        mentorTimezone,
      );

      for (
        let time = start.getTime();
        time < end.getTime();
        time += 60 * 60 * 1000
      ) {
        const isBooked = bookedTimes.includes(time);

        if (!isBooked) {
          slots.push(new Date(time).toISOString());
        }
      }
    }

    res.json({ success: true, data: slots, slots, timezone: mentorTimezone });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ error: "Failed to fetch available slots" });
  }
});

// Calendar events for mentor
router.get(
  "/calendar/:mentorId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { mentorId } = req.params;
      const { startDate, endDate } = req.query;

      // Ownership check: a user may only view their own private calendar.
      if (req.user?.id !== mentorId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Determine user role to query correct sessions
      const userResult = await db.query(
        "SELECT role FROM users WHERE id = $1",
        [mentorId],
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      const role = userResult.rows[0]?.role;

      let result;
      if (role === "student") {
        result = await db.query(
          `SELECT id, title, scheduled_at, status 
         FROM sessions 
         WHERE student_id = $1 
         AND scheduled_at BETWEEN $2 AND $3
         ORDER BY scheduled_at`,
          [mentorId, startDate, endDate],
        );
      } else {
        result = await db.query(
          `SELECT id, title, scheduled_at, status 
         FROM sessions 
         WHERE mentor_id = $1 
         AND scheduled_at BETWEEN $2 AND $3
         ORDER BY scheduled_at`,
          [mentorId, startDate, endDate],
        );
      }

      const events = result.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        start: row.scheduled_at,
        status: row.status,
        color:
          row.status === "completed"
            ? "green"
            : row.status === "cancelled"
              ? "red"
              : "blue",
      }));

      res.json({ success: true, data: events, events });
    } catch (error) {
      console.error("Error fetching calendar:", error);
      res.status(500).json({ error: "Failed to fetch calendar" });
    }
  },
);

export default router;
