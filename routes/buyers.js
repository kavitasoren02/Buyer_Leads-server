const express = require("express")
const multer = require("multer")
const csv = require("csv-parser")
const createCsvWriter = require("csv-writer").createObjectCsvWriter
const fs = require("fs")
const path = require("path")
const { Readable } = require("stream")
const pool = require("../config/database")
const { buyerSchema, updateBuyerSchema, csvRowSchema, filtersSchema } = require("../utils/validation")
const z = require("zod") // Import zod to fix the undeclared variable error

const router = express.Router()

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true)
    } else {
      cb(new Error("Only CSV files are allowed"))
    }
  },
})

// Helper function to record history
async function recordHistory(buyerId, changedBy, diff) {
  await pool.query("INSERT INTO buyer_history (buyer_id, changed_by, diff) VALUES ($1, $2, $3)", [
    buyerId,
    changedBy,
    JSON.stringify(diff),
  ])
}

// Helper function to check ownership
function checkOwnership(req, buyerOwnerId) {
  return req.user.role === "admin" || req.user.id === buyerOwnerId
}

// POST /api/buyers - Create new buyer
router.post("/", async (req, res) => {
  try {
    const validatedData = buyerSchema.parse(req.body)

    const {
      fullName,
      email,
      phone,
      city,
      propertyType,
      bhk,
      purpose,
      budgetMin,
      budgetMax,
      timeline,
      source,
      status,
      notes,
      tags,
    } = validatedData

    const result = await pool.query(
      `
      INSERT INTO buyers (
        full_name, email, phone, city, property_type, bhk, purpose,
        budget_min, budget_max, timeline, source, status, notes, tags, owner_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `,
      [
        fullName,
        email || null,
        phone,
        city,
        propertyType,
        bhk || null,
        purpose,
        budgetMin || null,
        budgetMax || null,
        timeline,
        source,
        status || "New",
        notes || null,
        tags || [],
        req.user.id,
      ],
    )

    const buyer = result.rows[0]

    // Record creation in history
    await recordHistory(buyer.id, req.user.id, {
      action: "created",
      data: validatedData,
    })

    res.status(201).json({
      message: "Buyer created successfully",
      buyer,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      })
    }
    console.error("Create buyer error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// PUT /api/buyers/:id - Update buyer
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const validatedData = updateBuyerSchema.parse(req.body)

    // Get current buyer to check ownership and concurrency
    const currentResult = await pool.query("SELECT * FROM buyers WHERE id = $1", [id])
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Buyer not found" })
    }

    const currentBuyer = currentResult.rows[0]

    // Check ownership
    if (!checkOwnership(req, currentBuyer.owner_id)) {
      return res.status(403).json({ error: "Access denied. You can only edit your own buyers." })
    }

    // Check concurrency (if updatedAt is provided)
    if (validatedData.updatedAt) {
      const providedTime = new Date(validatedData.updatedAt)
      const currentTime = new Date(currentBuyer.updated_at)

      if (providedTime.getTime() !== currentTime.getTime()) {
        return res.status(409).json({
          error: "Record has been modified by another user. Please refresh and try again.",
          currentUpdatedAt: currentBuyer.updated_at,
        })
      }
    }

    // Build update query dynamically
    const updateFields = []
    const updateValues = []
    let paramCount = 0

    const fieldMapping = {
      fullName: "full_name",
      email: "email",
      phone: "phone",
      city: "city",
      propertyType: "property_type",
      bhk: "bhk",
      purpose: "purpose",
      budgetMin: "budget_min",
      budgetMax: "budget_max",
      timeline: "timeline",
      source: "source",
      status: "status",
      notes: "notes",
      tags: "tags",
    }

    const changes = {}

    for (const [key, value] of Object.entries(validatedData)) {
      if (key === "updatedAt") continue

      const dbField = fieldMapping[key]
      if (dbField && value !== undefined) {
        paramCount++
        updateFields.push(`${dbField} = $${paramCount}`)
        updateValues.push(value === "" ? null : value)

        // Track changes for history
        if (currentBuyer[dbField] !== value) {
          changes[key] = {
            from: currentBuyer[dbField],
            to: value,
          }
        }
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" })
    }

    // Add WHERE clause parameter
    paramCount++
    updateValues.push(id)

    const updateQuery = `
      UPDATE buyers 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `

    const result = await pool.query(updateQuery, updateValues)
    const updatedBuyer = result.rows[0]

    // Record changes in history
    if (Object.keys(changes).length > 0) {
      await recordHistory(id, req.user.id, {
        action: "updated",
        changes,
      })
    }

    res.json({
      message: "Buyer updated successfully",
      buyer: updatedBuyer,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      })
    }
    console.error("Update buyer error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/buyers/:id - Delete buyer
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    // Get current buyer to check ownership
    const currentResult = await pool.query("SELECT * FROM buyers WHERE id = $1", [id])
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Buyer not found" })
    }

    const currentBuyer = currentResult.rows[0]

    // Check ownership
    if (!checkOwnership(req, currentBuyer.owner_id)) {
      return res.status(403).json({ error: "Access denied. You can only delete your own buyers." })
    }

    // Delete buyer (history will be cascade deleted)
    await pool.query("DELETE FROM buyers WHERE id = $1", [id])

    res.json({ message: "Buyer deleted successfully" })
  } catch (error) {
    console.error("Delete buyer error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/buyers/import - CSV Import
router.post("/import", upload.single("csvFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "CSV file is required" })
    }

    const csvData = req.file.buffer.toString("utf8")
    const rows = []
    const errors = []

    // Parse CSV
    const stream = Readable.from([csvData])

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on("data", (row) => {
          rows.push(row)
        })
        .on("end", resolve)
        .on("error", reject)
    })

    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV file is empty" })
    }

    if (rows.length > 200) {
      return res.status(400).json({ error: "CSV file cannot contain more than 200 rows" })
    }

    // Validate each row
    const validRows = []

    rows.forEach((row, index) => {
      try {
        // Convert string values to appropriate types
        const processedRow = {
          ...row,
          budgetMin: row.budgetMin ? Number.parseInt(row.budgetMin) : undefined,
          budgetMax: row.budgetMax ? Number.parseInt(row.budgetMax) : undefined,
          tags: row.tags || "",
        }

        const validatedRow = csvRowSchema.parse(processedRow)
        validRows.push(validatedRow)
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push({
            row: index + 1,
            errors: error.errors?.map((e) => `${e.path.join(".")}: ${e.message}`),
          })
        } else {
          errors.push({
            row: index + 1,
            errors: [error.message],
          })
        }
      }
    })

    // If there are validation errors, return them
    if (errors.length > 0) {
      return res.status(400).json({
        error: "Validation failed for some rows",
        errors,
        validRowsCount: validRows.length,
        totalRowsCount: rows.length,
      })
    }

    // Insert valid rows in a transaction
    const client = await pool.connect()
    const insertedBuyers = []

    try {
      await client.query("BEGIN")

      for (const row of validRows) {
        const {
          fullName,
          email,
          phone,
          city,
          propertyType,
          bhk,
          purpose,
          budgetMin,
          budgetMax,
          timeline,
          source,
          status,
          notes,
          tags,
        } = row

        const result = await client.query(
          `
          INSERT INTO buyers (
            full_name, email, phone, city, property_type, bhk, purpose,
            budget_min, budget_max, timeline, source, status, notes, tags, owner_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `,
          [
            fullName,
            email || null,
            phone,
            city,
            propertyType,
            bhk || null,
            purpose,
            budgetMin || null,
            budgetMax || null,
            timeline,
            source,
            status || "New",
            notes || null,
            tags || [],
            req.user.id,
          ],
        )

        const buyer = result.rows[0]
        insertedBuyers.push(buyer)

        // Record creation in history
        await client.query("INSERT INTO buyer_history (buyer_id, changed_by, diff) VALUES ($1, $2, $3)", [
          buyer.id,
          req.user.id,
          JSON.stringify({
            action: "imported",
            data: row,
          }),
        ])
      }

      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }

    res.json({
      message: `Successfully imported ${insertedBuyers.length} buyers`,
      importedCount: insertedBuyers.length,
      buyers: insertedBuyers,
    })
  } catch (error) {
    console.error("Import CSV error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/buyers/export - CSV Export
router.get("/export", async (req, res) => {
  try {
    // Use the same filtering logic as the list endpoint
    const filters = filtersSchema.parse(req.query)
    
    const { city, propertyType, status, timeline, search, sortBy, sortOrder } = filters

    let query = `
      SELECT 
        b.full_name as "fullName",
        b.email,
        b.phone,
        b.city,
        b.property_type as "propertyType",
        b.bhk,
        b.purpose,
        b.budget_min as "budgetMin",
        b.budget_max as "budgetMax",
        b.timeline,
        b.source,
        b.status,
        b.notes,
        array_to_string(b.tags, ',') as tags,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt"
      FROM buyers b
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 0

    // Apply same filters as list endpoint
    if (city) {
      paramCount++
      query += ` AND b.city = $${paramCount}`
      queryParams.push(city)
    }

    if (propertyType) {
      paramCount++
      query += ` AND b.property_type = $${paramCount}`
      queryParams.push(propertyType)
    }

    if (status) {
      paramCount++
      query += ` AND b.status = $${paramCount}`
      queryParams.push(status)
    }

    if (timeline) {
      paramCount++
      query += ` AND b.timeline = $${paramCount}`
      queryParams.push(timeline)
    }

    if (search) {
      paramCount++
      query += ` AND (
        b.full_name ILIKE $${paramCount} OR 
        b.phone ILIKE $${paramCount} OR 
        b.email ILIKE $${paramCount}
      )`
      queryParams.push(`%${search}%`)
    }

    // Apply sorting
    const validSortColumns = {
      updatedAt: "b.updated_at",
      fullName: "b.full_name",
      createdAt: "b.created_at",
    }

    query += ` ORDER BY ${validSortColumns[sortBy]} ${sortOrder.toUpperCase()}`

    const result = await pool.query(query, queryParams)

    // Generate CSV
    const csvWriter = createCsvWriter({
      path: "/tmp/buyers_export.csv",
      header: [
        { id: "fullName", title: "fullName" },
        { id: "email", title: "email" },
        { id: "phone", title: "phone" },
        { id: "city", title: "city" },
        { id: "propertyType", title: "propertyType" },
        { id: "bhk", title: "bhk" },
        { id: "purpose", title: "purpose" },
        { id: "budgetMin", title: "budgetMin" },
        { id: "budgetMax", title: "budgetMax" },
        { id: "timeline", title: "timeline" },
        { id: "source", title: "source" },
        { id: "status", title: "status" },
        { id: "notes", title: "notes" },
        { id: "tags", title: "tags" },
      ],
    })

    await csvWriter.writeRecords(result.rows)

    // Send file
    const filename = `buyers_export_${new Date().toISOString().split("T")[0]}.csv`

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)

    const fileStream = fs.createReadStream("/tmp/buyers_export.csv")
    fileStream.pipe(res)

    // Clean up temp file after sending
    fileStream.on("end", () => {
      fs.unlink("/tmp/buyers_export.csv", (err) => {
        if (err) console.error("Error deleting temp file:", err)
      })
    })
  } catch (error) {
    console.error("Export CSV error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/buyers - List buyers with filters, search, and pagination
router.get("/", async (req, res) => {
  try {
    console.log({
      r: req.query
    })
    const filters = filtersSchema.parse(req.query)
    const { city, propertyType, status, timeline, search, page, limit, sortBy, sortOrder } = filters

    let query = `
      SELECT 
        b.*,
        u.email as owner_email,
        COUNT(*) OVER() as total_count
      FROM buyers b
      JOIN users u ON b.owner_id = u.id
      WHERE 1=1
    `

    const queryParams = []
    let paramCount = 0

    // Apply filters
    if (city) {
      paramCount++
      query += ` AND b.city = $${paramCount}`
      queryParams.push(city)
    }

    if (propertyType) {
      paramCount++
      query += ` AND b.property_type = $${paramCount}`
      queryParams.push(propertyType)
    }

    if (status) {
      paramCount++
      query += ` AND b.status = $${paramCount}`
      queryParams.push(status)
    }

    if (timeline) {
      paramCount++
      query += ` AND b.timeline = $${paramCount}`
      queryParams.push(timeline)
    }

    // Apply search
    if (search) {
      paramCount++
      query += ` AND (
        b.full_name ILIKE $${paramCount} OR 
        b.phone ILIKE $${paramCount} OR 
        b.email ILIKE $${paramCount} OR
        to_tsvector('english', COALESCE(b.full_name, '') || ' ' || COALESCE(b.email, '') || ' ' || COALESCE(b.notes, '')) @@ plainto_tsquery('english', $${paramCount})
      )`
      queryParams.push(`%${search}%`)
    }

    // Apply sorting
    const validSortColumns = {
      updatedAt: "b.updated_at",
      fullName: "b.full_name",
      createdAt: "b.created_at",
    }

    query += ` ORDER BY ${validSortColumns[sortBy]} ${sortOrder.toUpperCase()}`

    // Apply pagination
    const offset = (page - 1) * limit
    paramCount++
    query += ` LIMIT $${paramCount}`
    queryParams.push(limit)

    paramCount++
    query += ` OFFSET $${paramCount}`
    queryParams.push(offset)

    const result = await pool.query(query, queryParams)

    const totalCount = result.rows.length > 0 ? Number.parseInt(result.rows[0].total_count) : 0
    const totalPages = Math.ceil(totalCount / limit)

    // Remove total_count from each row
    const buyers = result.rows.map((row) => {
      const { total_count, ...buyer } = row
      return buyer
    })

    res.json({
      buyers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: { city, propertyType, status, timeline, search },
    })
  } catch (error) {
    console.error("Get buyers error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/buyers/:id - Get single buyer
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      `
      SELECT 
        b.*,
        u.email as owner_email
      FROM buyers b
      JOIN users u ON b.owner_id = u.id
      WHERE b.id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Buyer not found" })
    }

    const buyer = result.rows[0]

    // Get history (last 5 changes)
    const historyResult = await pool.query(
      `
      SELECT 
        bh.*,
        u.email as changed_by_email
      FROM buyer_history bh
      JOIN users u ON bh.changed_by = u.id
      WHERE bh.buyer_id = $1
      ORDER BY bh.changed_at DESC
      LIMIT 5
    `,
      [id],
    )

    res.json({
      buyer,
      history: historyResult.rows,
    })
  } catch (error) {
    console.error("Get buyer error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

module.exports = router
