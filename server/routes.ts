import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Calculation endpoint
  app.post("/api/calculate", async (req, res) => {
    try {
      const {
        runType,
        policyId,
        valuationDate,
        projectionMonths,
        product,
        analysisMode,
      } = req.body;

      // Validate required fields
      if (!runType || !valuationDate || !product) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["runType", "valuationDate", "product"],
        });
      }

      // For single policy runs, validate policyId
      if (runType === "single" && !policyId) {
        return res.status(400).json({
          error: "Policy ID is required for single policy runs",
        });
      }

      // Simulate calculation logic
      // In a real application, this would call your backend calculation engine
      const calculationResult = {
        success: true,
        timestamp: new Date().toISOString(),
        parameters: {
          runType,
          policyId,
          valuationDate,
          projectionMonths,
          product,
          analysisMode,
        },
        results: {
          status: "completed",
          calculations: {
            presentValue: 125000.5,
            projectedValue: 165000.75,
            mortality: 500.25,
            surrenderCharge: 250.0,
          },
          message:
            runType === "single"
              ? `Calculation completed for Policy ID: ${policyId}`
              : "Portfolio calculation completed",
        },
      };

      res.json(calculationResult);
    } catch (error) {
      console.error("Calculation error:", error);
      res.status(500).json({
        error: "Internal server error during calculation",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return httpServer;
}
