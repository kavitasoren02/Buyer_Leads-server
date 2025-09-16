const jwt = require("jsonwebtoken")
const pool = require("../config/database")

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Verify user still exists
    const userResult = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [decoded.userId])

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found" })
    }

    req.user = userResult.rows[0]
    next()
  } catch (error) {
    console.error("Token verification error:", error)
    return res.status(403).json({ error: "Invalid or expired token" })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" })
  }
  next()
}

module.exports = {
  authenticateToken,
  requireAdmin,
}
