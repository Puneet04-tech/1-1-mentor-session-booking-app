import { Router, Response } from "express";
import { query, queryOne } from "@/database";
import authMiddleware, { AuthRequest } from "@/middleware/auth";
import requireRole from "@/middleware/requireRole";
import { v4 as uuidv4 } from "uuid";

const router = Router();

const normalizeMentorId = (mentorId?: string) => mentorId?.trim();

// Bookmark / Favorite Mentors (issue #166).
//
// Only students can maintain a favorites list, so every route below is gated by
// `requireRole('student')`. Each query is additionally scoped to the caller's
// own id, so a student can only ever read or mutate their own favorites.

// List the authenticated student's saved mentors (with mentor profile details).
router.get(
  "/",
  authMiddleware,
  requireRole("student"),
  async (req: AuthRequest, res: Response) => {
    try {
      const favorites = await query(
        `SELECT u.id, u.email, u.name, u.avatar_url, u.bio, u.role, u.timezone,
              u.verified, u.hourly_rate,
              u.avg_rating::float8 as avg_rating, u.total_sessions,
              f.created_at as favorited_at
       FROM favorites f
       JOIN users u ON u.id = f.mentor_id
       WHERE f.student_id = $1
       ORDER BY f.created_at DESC`,
        [req.user?.id],
      );

      res.json({
        success: true,
        data: favorites.rows,
      });
    } catch (err) {
      console.error("Get favorites error:", err);
      res.status(500).json({ error: "Failed to get favorites" });
    }
  },
);

// Lightweight list of favorited mentor ids — lets the frontend render the
// correct toggle state on mentor cards without fetching full profiles.
router.get(
  "/ids",
  authMiddleware,
  requireRole("student"),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await query(
        "SELECT mentor_id FROM favorites WHERE student_id = $1",
        [req.user?.id],
      );

      res.json({
        success: true,
        data: result.rows.map((row) => row.mentor_id),
      });
    } catch (err) {
      console.error("Get favorite ids error:", err);
      res.status(500).json({ error: "Failed to get favorites" });
    }
  },
);

// Add a mentor to the student's favorites.
router.post(
  "/",
  authMiddleware,
  requireRole("student"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { mentor_id } = req.body;
      const studentId = req.user?.id;

      const normalizedMentorId = normalizeMentorId(mentor_id);

      if (!normalizedMentorId) {
        return res.status(400).json({
          error: "mentor_id is required",
        });
      }

      if (normalizedMentorId === studentId) {
        return res.status(400).json({
          error: "You cannot favorite your own account",
        });
      }

      const mentor = await queryOne(
        "SELECT id, role FROM users WHERE id = $1",
        [normalizedMentorId],
      );
      if (!mentor || mentor.role !== "mentor") {
        return res.status(404).json({ error: "Mentor not found" });
      }

      let favorite;
      const id = uuidv4();
      try {
        favorite = await queryOne(
          `INSERT INTO favorites (
      id,
      student_id,
      mentor_id
   )
   VALUES ($1, $2, $3)
   RETURNING id, mentor_id, created_at`,
          [id, studentId, normalizedMentorId]
        );
      } catch (err: any) {
        // Unique constraint — this mentor is already favorited. Treat as success
        // so the toggle is idempotent and safe to double-tap.
        if (err.code === "23505") {
          const existingFavorite = await queryOne(
            `SELECT id, mentor_id, created_at
     FROM favorites
     WHERE student_id = $1
       AND mentor_id = $2`,
            [studentId, normalizedMentorId],
          );

          return res.status(200).json({
            success: true,
            alreadyFavorited: true,
            data: existingFavorite,
          });
        }
        throw err;
      }

      res.status(201).json({
        success: true,
        data: favorite,
      });
    } catch (err) {
      console.error("Add favorite error:", err);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  },
);

// Remove a mentor from the student's favorites.
router.delete(
  "/:mentor_id",
  authMiddleware,
  requireRole("student"),
  async (req: AuthRequest, res: Response) => {
    try {
      const normalizedMentorId = normalizeMentorId(req.params.mentor_id);

      if (!normalizedMentorId) {
        return res.status(400).json({
          error: "mentor_id is required",
        });
      }

      const result = await query(
        "DELETE FROM favorites WHERE student_id = $1 AND mentor_id = $2 RETURNING id",
        [req.user?.id, normalizedMentorId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Favorite not found" });
      }

      res.json({
        success: true,
        data: { mentor_id: normalizedMentorId },
      });
    } catch (err) {
      console.error("Remove favorite error:", err);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  },
);

export default router;
