import express, { Request, Response } from "express";
import paymentService from "../../bot/services/payment.service";
import logger from "../../bot/utils/logger";

const router = express.Router();

// NOWPayments IPN webhook
router.post("/nowpayments", async (req: Request, res: Response) => {
  try {
    logger.info(undefined, "Received NOWPayments webhook", req.body);

    await paymentService.handleWebhook(req.body);

    res.status(200).send("OK");
  } catch (error) {
    logger.error(undefined, "Error processing webhook", error);
    res.status(500).send("Error");
  }
});

export default router;
