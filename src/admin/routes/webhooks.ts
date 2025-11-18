import express, { Request, Response } from "express";
import paymentService from "../../bot/services/payment.service";
import logger from "../../bot/utils/logger";

const router = express.Router();

// NOWPayments IPN webhook
router.post("/nowpayments", async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-nowpayments-sig'] as string;

    logger.info(undefined, "Received NOWPayments webhook", {
      body: req.body,
      signature: signature ? 'present' : 'missing'
    });

    // Verify IPN signature
    if (!signature) {
      logger.warn(undefined, "NOWPayments webhook received without signature");
      return res.status(400).send("Missing signature");
    }

    const isValid = paymentService.verifyIPNSignature(req.body, signature);

    if (!isValid) {
      logger.error(undefined, "Invalid NOWPayments IPN signature");
      return res.status(403).send("Invalid signature");
    }

    await paymentService.handleWebhook(req.body);

    res.status(200).send("OK");
  } catch (error) {
    logger.error(undefined, "Error processing webhook", error);
    res.status(500).send("Error");
  }
});

export default router;
