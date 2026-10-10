import Joi from "joi";
import supabase from "../config/supabase.js";

/**
 * Controller to list and filter audit logs for the authenticated user.
 * 
 * Supports:
 * - Pagination: page, limit (max 100)
 * - Filtering: eventType, outcome, severity, startDate, endDate
 * - Safe sorting by created_at DESC
 */
export const getAuditLogs = async (req, res) => {
  const querySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    eventType: Joi.string().trim().max(100).optional(),
    outcome: Joi.string().valid("success", "failure", "blocked").optional(),
    severity: Joi.string().valid("debug", "info", "warning", "error", "critical").optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  });

  const { error: valError, value } = querySchema.validate(req.query);
  if (valError) {
    return res.status(400).json({
      success: false,
      message: valError.details[0].message
    });
  }

  const { page, limit, eventType, outcome, severity, startDate, endDate } = value;
  const offset = (page - 1) * limit;

  try {
    // Strictly restrict query to req.user.id (prevents IDOR and cross-user data leakage)
    let query = supabase
      .from("audit_logs")
      .select("id, event_type, resource_type, resource_id, resource_name, outcome, severity, correlation_id, metadata, ip_address, user_agent, created_at", { count: "exact" })
      .eq("actor_id", req.user.id);

    if (eventType) {
      query = query.eq("event_type", eventType);
    }
    if (outcome) {
      query = query.eq("outcome", outcome);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }
    if (startDate) {
      query = query.gte("created_at", new Date(startDate).toISOString());
    }
    if (endDate) {
      query = query.lte("created_at", new Date(endDate).toISOString());
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // In development or if table is empty / not yet created
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        },
        notice: error.message
      });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal server error retrieving audit logs"
    });
  }
};
