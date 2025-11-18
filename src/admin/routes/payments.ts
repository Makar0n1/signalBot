import express, { Request, Response } from "express";
import { Payment } from "../../bot/models";
import logger from "../../bot/utils/logger";

const router = express.Router();

// Get all payments with pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const payments = await Payment.find()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments();

    res.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(undefined, "Error fetching payments", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Get payments by user
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const payments = await Payment.find({ user_id: userId }).sort({ created_at: -1 });

    res.json({ payments });
  } catch (error) {
    logger.error(undefined, "Error fetching user payments", error);
    res.status(500).json({ error: "Failed to fetch user payments" });
  }
});

export default router;
