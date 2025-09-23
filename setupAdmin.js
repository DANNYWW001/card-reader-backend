const mongoose = require("mongoose");
require("dotenv").config();

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error(
    "MONGODB_URI is not defined in .env. Please set it in your .env file."
  );
  process.exit(1);
}

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  ipAddress: { type: String },
});
const Admin = mongoose.model("Admin", adminSchema);

async function initAdmin() {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      w: "majority",
      autoIndex: true,
    });
    const adminExists = await Admin.countDocuments();
    if (adminExists === 0) {
      await Admin.create({ username: "admin", password: "admin123" });
      console.log(
        "Initial admin user created with username: admin, password: admin123"
      );
    } else {
      console.log("Admin user already exists. No action taken.");
    }
  } catch (error) {
    console.error("Error initializing admin:", error);
  } finally {
    mongoose.connection.close();
  }
}
initAdmin();


