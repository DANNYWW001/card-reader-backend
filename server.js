require("dotenv").config(); // Load environment variables from .env

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: "https://localhost:5173" }));
app.use(bodyParser.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define Schema
const activationSchema = new mongoose.Schema({
  cardType: String,
  lastSixDigits: String,
  holderName: String,
  currency: String,
  dailyLimit: Number,
  accept: Boolean,
  createdAt: { type: Date, default: Date.now },
});

const Activation = mongoose.model("Activation", activationSchema);

// Endpoint for Step II: Validate last 6 digits
app.post("/validate-digits", (req, res) => {
  const { lastSixDigits } = req.body;
  console.log("Validating last 6 digits:", lastSixDigits);

  try {
    if (!lastSixDigits) {
      return res.status(400).json({ message: "Last 6 digits are required." });
    }
    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res
        .status(400)
        .json({ message: "Please enter exactly 6 digits." });
    }
    const dummyBlacklist = ["123456", "654321"];
    if (dummyBlacklist.includes(lastSixDigits)) {
      return res.status(400).json({ message: "This card number is invalid." });
    }
    return res
      .status(200)
      .json({
        message: "Digits validated successfully",
        data: { lastSixDigits },
      });
  } catch (error) {
    console.error("Server error in /validate-digits:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Endpoint for Step III: Activate card
app.post("/activate", async (req, res) => {
  const { cardType, lastSixDigits, holderName, currency, dailyLimit, accept } =
    req.body;
  console.log("Activating card with data:", req.body);

  try {
    if (
      !cardType ||
      !lastSixDigits ||
      !holderName ||
      !currency ||
      !dailyLimit ||
      !accept
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

    if (accept) {
      const newActivation = new Activation({
        cardType,
        lastSixDigits,
        holderName,
        currency,
        dailyLimit,
        accept,
      });
      await newActivation.save();
      return res.status(200).json({
        message: "Card activated successfully",
        data: { cardType, lastSixDigits, holderName, currency, dailyLimit },
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

// Start the server
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
