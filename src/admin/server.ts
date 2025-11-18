import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.ADMIN_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "src/admin/views"));

// Import routes
import userRoutes from "./routes/users";
import paymentRoutes from "./routes/payments";
import webhookRoutes from "./routes/webhooks";

// Use routes
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/webhooks", webhookRoutes);

// Dashboard route
app.get("/", (req: Request, res: Response) => {
  res.render("dashboard");
});

// Users page
app.get("/users", (req: Request, res: Response) => {
  res.render("users");
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/signalbot";

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Admin dashboard running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

export default app;
