const { z } = require("zod")

// Enums
const CityEnum = z.enum(["Chandigarh", "Mohali", "Zirakpur", "Panchkula", "Other"])
const PropertyTypeEnum = z.enum(["Apartment", "Villa", "Plot", "Office", "Retail"])
const BHKEnum = z.enum(["1", "2", "3", "4", "Studio"])
const PurposeEnum = z.enum(["Buy", "Rent"])
const TimelineEnum = z.enum(["0-3m", "3-6m", ">6m", "Exploring"])
const SourceEnum = z.enum(["Website", "Referral", "Walk-in", "Call", "Other"])
const StatusEnum = z.enum(["New", "Qualified", "Contacted", "Visited", "Negotiation", "Converted", "Dropped"])

// Phone validation (10-15 digits)
const phoneSchema = z.string().regex(/^\d{10,15}$/, "Phone must be 10-15 digits")

// Budget validation
const budgetSchema = z
  .object({
    budgetMin: z.number().int().min(0).optional(),
    budgetMax: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.budgetMin && data.budgetMax) {
        return data.budgetMax >= data.budgetMin
      }
      return true
    },
    {
      message: "Budget max must be greater than or equal to budget min",
    },
  )

// Main buyer schema
const buyerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(80, "Full name must be less than 80 characters"),
    email: z.string().email("Invalid email format").optional().or(z.literal("")),
    phone: phoneSchema,
    city: CityEnum,
    propertyType: PropertyTypeEnum,
    bhk: BHKEnum.optional(),
    purpose: PurposeEnum,
    budgetMin: z.number().int().min(0).optional(),
    budgetMax: z.number().int().min(0).optional(),
    timeline: TimelineEnum,
    source: SourceEnum,
    status: StatusEnum.default("New"),
    notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
    tags: z.array(z.string()).optional().default([]),
  })
  .refine(
    (data) => {
      // BHK required for Apartment and Villa
      if (["Apartment", "Villa"].includes(data.propertyType) && !data.bhk) {
        return false
      }
      return true
    },
    {
      message: "BHK is required for Apartment and Villa property types",
      path: ["bhk"],
    },
  )
  .refine(
    (data) => {
      // Budget validation
      if (data.budgetMin && data.budgetMax) {
        return data.budgetMax >= data.budgetMin
      }
      return true
    },
    {
      message: "Budget max must be greater than or equal to budget min",
      path: ["budgetMax"],
    },
  )

// CSV row schema
const csvRowSchema = buyerSchema.safeExtend({
  tags: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return []
      return val
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    }),
})

// Update schema (allows partial updates)
const updateBuyerSchema = buyerSchema.partial().safeExtend({
  updatedAt: z.string().datetime().optional(),
})

// Query filters schema
const filtersSchema = z.object({
  city: CityEnum.optional().or(z.literal("")),
  propertyType: PropertyTypeEnum.optional().or(z.literal("")),
  status: StatusEnum.optional().or(z.literal("")),
  timeline: TimelineEnum.optional().or(z.literal("")),
  search: z.string().optional().or(z.literal("")),
  page: z.union([z.coerce.number().int().min(1), z.literal("")]).default(1),
  limit: z.union([z.coerce.number().int().min(1).max(100), z.literal("")]).default(10),
  sortBy: z.enum(["updatedAt", "fullName", "createdAt"]).or(z.literal("")).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).or(z.literal("")).default("desc"),
})


module.exports = {
  buyerSchema,
  updateBuyerSchema,
  csvRowSchema,
  filtersSchema,
  CityEnum,
  PropertyTypeEnum,
  BHKEnum,
  PurposeEnum,
  TimelineEnum,
  SourceEnum,
  StatusEnum,
}
