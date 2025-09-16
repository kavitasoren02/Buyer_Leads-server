const bcrypt = require("bcryptjs")
const pool = require("../config/database")

async function seedDatabase() {
  try {
    console.log("Starting database seeding...")

    // Create demo users
    const hashedPassword = await bcrypt.hash("demo123", 10)

    const userResult = await pool.query(
      `
      INSERT INTO users (email, password_hash, role) 
      VALUES 
        ('demo@example.com', $1, 'user'),
        ('admin@example.com', $1, 'admin')
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email, role
    `,
      [hashedPassword],
    )

    if (userResult.rows.length > 0) {
      console.log("✓ Demo users created:")
      userResult.rows.forEach((user) => {
        console.log(`  - ${user.email} (${user.role})`)
      })
    } else {
      console.log("⏭ Demo users already exist")
    }

    // Get user ID for seeding buyers
    const demoUserResult = await pool.query("SELECT id FROM users WHERE email = $1", ["demo@example.com"])
    const demoUserId = demoUserResult.rows[0]?.id

    if (demoUserId) {
      // Create sample buyers
      const sampleBuyers = [
        {
          fullName: "Rajesh Kumar",
          email: "rajesh@example.com",
          phone: "9876543210",
          city: "Chandigarh",
          propertyType: "Apartment",
          bhk: "3",
          purpose: "Buy",
          budgetMin: 5000000,
          budgetMax: 7000000,
          timeline: "0-3m",
          source: "Website",
          status: "New",
          notes: "Looking for a spacious 3BHK apartment in Sector 22",
          tags: ["urgent", "family"],
        },
        {
          fullName: "Priya Sharma",
          email: "priya@example.com",
          phone: "9876543211",
          city: "Mohali",
          propertyType: "Villa",
          bhk: "4",
          purpose: "Buy",
          budgetMin: 8000000,
          budgetMax: 12000000,
          timeline: "3-6m",
          source: "Referral",
          status: "Qualified",
          notes: "Interested in independent villa with garden",
          tags: ["premium", "garden"],
        },
        {
          fullName: "Amit Singh",
          email: null,
          phone: "9876543212",
          city: "Zirakpur",
          propertyType: "Plot",
          bhk: null,
          purpose: "Buy",
          budgetMin: 2000000,
          budgetMax: 3000000,
          timeline: ">6m",
          source: "Walk-in",
          status: "Contacted",
          notes: "Looking for residential plot for future construction",
          tags: ["investment"],
        },
      ]

      for (const buyer of sampleBuyers) {
        await pool.query(
          `
          INSERT INTO buyers (
            full_name, email, phone, city, property_type, bhk, purpose,
            budget_min, budget_max, timeline, source, status, notes, tags, owner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT DO NOTHING
        `,
          [
            buyer.fullName,
            buyer.email,
            buyer.phone,
            buyer.city,
            buyer.propertyType,
            buyer.bhk,
            buyer.purpose,
            buyer.budgetMin,
            buyer.budgetMax,
            buyer.timeline,
            buyer.source,
            buyer.status,
            buyer.notes,
            buyer.tags,
            demoUserId,
          ],
        )
      }

      console.log("✓ Sample buyers created")
    }

    console.log("Database seeding completed successfully!")
  } catch (error) {
    console.error("Seeding failed:", error)
    process.exit(1)
  } finally {
    // await pool.end()
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
}

module.exports = seedDatabase
