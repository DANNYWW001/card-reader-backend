const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

require("dotenv").config();

app.use(express.json());
app.use(
  cors()
);

const PORT = process.env.PORT || 3001;

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const activationSchema = new mongoose.Schema({
  cardType: String,
  lastSixDigits: String,
  holderName: String,
  currency: String,
  dailyLimit: Number,
  accept: Boolean,
  pin: String, // Added pin field
  createdAt: { type: Date, default: Date.now },
});

const Activation = mongoose.model("Activation", activationSchema);

app.post("/validate-digits", async (req, res) => {
  const { lastSixDigits } = req.body;
  console.log("Validating digits:", lastSixDigits);

  try {
    if (!lastSixDigits) {
      return res.status(400).json({ message: "Last 6 digits are required." });
    }
    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res.status(400).json({ message: "Invalid last 6 digits." });
    }
    return res.status(200).json({ message: "Digits validated successfully" });
  } catch (error) {
    console.error("Server error in /validate-digits:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/activate", async (req, res) => {
  const {
    cardType,
    lastSixDigits,
    holderName,
    currency,
    dailyLimit,
    accept,
    pin,
  } = req.body;
  console.log("Activating card with data:", req.body);

  try {
    if (
      !cardType ||
      !lastSixDigits ||
      !holderName ||
      !currency ||
      !dailyLimit ||
      !accept ||
      !pin
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res.status(400).json({ message: "Invalid last 6 digits." });
    }
    if (parseInt(dailyLimit) > 5000 || parseInt(dailyLimit) < 0) {
      return res
        .status(400)
        .json({ message: "Daily limit must be between 0 and 5000." });
    }
    if (
      ![
        "USD",
        "EUR",
        "GBP",
        "JPY",
        "CAD",
        "AUD",
        "CHF",
        "CNY",
        "INR",
        "ZAR",
      ].includes(currency)
    ) {
      return res.status(400).json({ message: "Unsupported currency." });
    }
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      // New PIN validation
      return res.status(400).json({ message: "Invalid PIN." });
    }

    if (accept) {
      const newActivation = new Activation({
        cardType,
        lastSixDigits,
        holderName,
        currency,
        dailyLimit,
        accept,
        pin, // Include pin in the new activation
      });
      await newActivation.save();
      console.log("Activation saved to DB");
      return res.status(200).json({
        message: "Card activated successfully",
        data: {
          cardType,
          lastSixDigits,
          holderName,
          currency,
          dailyLimit,
          pin,
        },
      });
    } else {
      return res
        .status(400)
        .json({ message: "Acceptance of terms is required." });
    }
  } catch (error) {
    console.error("Server error in /activate:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
