const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

require("dotenv").config();

app.use(express.json());

// Configure CORS to allow all origins
app.use(cors());

const PORT = process.env.PORT || 3001;

// MongoDB Connection with error handling
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("MONGODB_URI is not defined in .env");
  process.exit(1);
}

mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

const activationSchema = new mongoose.Schema({
  cardType: { type: String, required: true },
  lastSixDigits: { type: String, required: true },
  holderName: { type: String, required: true },
  currency: { type: String, required: true },
  dailyLimit: { type: Number, required: true },
  accept: { type: Boolean, required: true },
  pin: { type: String, required: true }, // Plain text PIN for now
  createdAt: { type: Date, default: Date.now },
});

const Activation = mongoose.model("Activation", activationSchema);

// Validate last 6 digits
app.post("/validate-digits", async (req, res) => {
  const { lastSixDigits } = req.body;
  console.log("Validating digits:", lastSixDigits);

  try {
    if (!lastSixDigits) {
      return res
        .status(400)
        .json({ message: "Please provide the last 6 digits of your card." });
    }
    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res
        .status(400)
        .json({ message: "The last 6 digits must be exactly 6 numbers." });
    }
    return res.status(200).json({ message: "Digits validated successfully" });
  } catch (error) {
    console.error("Server error in /validate-digits:", error);
    return res
      .status(500)
      .json({
        message: "An unexpected error occurred. Please try again later.",
      });
  }
});

// Activate card with PIN
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
    // Validate required fields
    if (
      !cardType ||
      !lastSixDigits ||
      !holderName ||
      !currency ||
      dailyLimit == null ||
      accept == null ||
      !pin
    ) {
      return res
        .status(400)
        .json({ message: "All fields are required to activate your card." });
    }

    // Validate last 6 digits
    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res
        .status(400)
        .json({ message: "The last 6 digits must be exactly 6 numbers." });
    }

    // Validate daily limit
    const limit = parseInt(dailyLimit);
    if (limit > 5000 || limit < 0) {
      return res
        .status(400)
        .json({ message: "Daily limit must be between 0 and 5000." });
    }

    // Validate currency
    const validCurrencies = [
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
    ];
    if (!validCurrencies.includes(currency)) {
      return res
        .status(400)
        .json({ message: "Unsupported currency selected." });
    }

    // Validate PIN
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits." });
    }

    // Check acceptance
    if (!accept) {
      return res
        .status(400)
        .json({ message: "You must accept the terms to proceed." });
    }

    // Save to database
    const newActivation = new Activation({
      cardType,
      lastSixDigits,
      holderName,
      currency,
      dailyLimit: limit,
      accept,
      pin, // Store PIN in plain text
    });
    await newActivation.save();
    console.log("Activation saved to DB");

    // Return success without sensitive data in response
    return res.status(200).json({ message: "Card activated successfully" });
  } catch (error) {
    console.error("Server error in /activate:", error);
    return res
      .status(500)
      .json({
        message: "An unexpected error occurred. Please try again later.",
      });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
