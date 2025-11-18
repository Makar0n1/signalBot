import express, { Request, Response } from "express";
import { User, Admin } from "../../bot/models";
import logger from "../../bot/utils/logger";

const router = express.Router();

// Get all users with pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || "";
    const skip = (page - 1) * limit;

    const query: any = {};
    if (search) {
      query.$or = [
        { user_id: isNaN(Number(search)) ? undefined : Number(search) },
        { username: { $regex: search, $options: "i" } }
      ].filter(q => q.user_id !== undefined || q.username);
    }

    const users = await User.find(query)
      .populate("config")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    const usersData = users.map(user => ({
      id: user._id,
      user_id: user.user_id,
      username: user.username || "N/A",
      trial_started: user.trial_started_at,
      trial_expires: user.trial_expires_at,
      subscription_active: user.subscription_active,
      subscription_expires: user.subscription_expires_at,
      is_banned: user.is_banned,
      is_admin: user.is_admin,
      created_at: user.created_at,
      has_access: user.is_admin || (user.is_banned ? false : (
        user.subscription_active && user.subscription_expires_at && user.subscription_expires_at > new Date()
      ) || (
        user.trial_expires_at && user.trial_expires_at > new Date()
      ))
    }));

    res.json({
      users: usersData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(undefined, "Error fetching users", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get single user by ID
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ user_id: req.params.userId }).populate("config");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user._id,
      user_id: user.user_id,
      username: user.username,
      trial_started: user.trial_started_at,
      trial_expires: user.trial_expires_at,
      subscription_active: user.subscription_active,
      subscription_expires: user.subscription_expires_at,
      is_banned: user.is_banned,
      created_at: user.created_at,
      config: user.config
    });
  } catch (error) {
    logger.error(undefined, "Error fetching user", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Ban/Unban user
router.patch("/:userId/ban", async (req: Request, res: Response) => {
  try {
    const { is_banned } = req.body;
    const user = await User.findOne({ user_id: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent banning admins
    if (user.is_admin) {
      return res.status(403).json({ error: "Cannot ban admin users" });
    }

    user.is_banned = is_banned;
    await user.save();

    logger.info(undefined, `User ${user.user_id} ${is_banned ? 'banned' : 'unbanned'}`);

    res.json({
      success: true,
      message: `User ${is_banned ? 'banned' : 'unbanned'} successfully`,
      user: {
        user_id: user.user_id,
        is_banned: user.is_banned
      }
    });
  } catch (error) {
    logger.error(undefined, "Error updating user ban status", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Grant/Revoke admin access
router.patch("/:userId/admin", async (req: Request, res: Response) => {
  try {
    const { is_admin } = req.body;
    const userId = parseInt(req.params.userId);

    if (is_admin) {
      // Create admin record
      const existingAdmin = await Admin.findOne({ user_id: userId });
      if (!existingAdmin) {
        await Admin.create({ user_id: userId, isSuperAdmin: false });
        logger.info(undefined, `Admin access granted to user ${userId}`);
      }
    } else {
      // Remove admin record
      await Admin.deleteOne({ user_id: userId });
      logger.info(undefined, `Admin access revoked from user ${userId}`);
    }

    res.json({
      success: true,
      message: `Admin access ${is_admin ? 'granted' : 'revoked'} successfully`
    });
  } catch (error) {
    logger.error(undefined, "Error updating admin status", error);
    res.status(500).json({ error: "Failed to update admin status" });
  }
});

// Extend subscription
router.patch("/:userId/subscription", async (req: Request, res: Response) => {
  try {
    const { days } = req.body;
    const user = await User.findOne({ user_id: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    const currentExpiry = user.subscription_expires_at && user.subscription_expires_at > now
      ? user.subscription_expires_at
      : now;

    const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);

    user.subscription_active = true;
    user.subscription_expires_at = newExpiry;
    await user.save();

    logger.info(undefined, `Subscription extended for user ${user.user_id} by ${days} days`);

    res.json({
      success: true,
      message: `Subscription extended by ${days} days`,
      expires_at: newExpiry
    });
  } catch (error) {
    logger.error(undefined, "Error extending subscription", error);
    res.status(500).json({ error: "Failed to extend subscription" });
  }
});

// Delete user
router.delete("/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findOneAndDelete({ user_id: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(undefined, `User ${user.user_id} deleted`);

    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    logger.error(undefined, "Error deleting user", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
