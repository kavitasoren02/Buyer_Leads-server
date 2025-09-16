const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { z } = require("zod")
const pool = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
})

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["user", "admin"]).default("user"),
})

// Register new user
router.post("/register", async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body)
    const { email, password, role } = validatedData

    // Check if user already exists
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email])
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists with this email" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at",
      [email, hashedPassword, role],
    )

    const user = result.rows[0]

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    })

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
      },
      token,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      })
    }
    console.error("Registration error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Login user
router.post("/login", async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body)
    const { email, password } = validatedData

    // Find user
    const result = await pool.query("SELECT id, email, password_hash, role FROM users WHERE email = $1", [email])

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    const user = result.rows[0]

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    })

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      })
    }
    console.error("Login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get current user profile
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, role, created_at FROM users WHERE id = $1", [req.user.id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({ user: result.rows[0] })
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Demo login (for testing)
router.post("/demo-login", async (req, res) => {
  try {
    const { role = "user" } = req.body

    const email = role === "admin" ? "admin@example.com" : "demo@example.com"

    const result = await pool.query("SELECT id, email, role FROM users WHERE email = $1", [email])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Demo user not found. Please run seed script." })
    }

    const user = result.rows[0]

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    })

    res.json({
      message: "Demo login successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    })
  } catch (error) {
    console.error("Demo login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
