//facultyRoutes.js
const express = require("express");
const router = express.Router();
const Faculty = require("../models/Faculty");

router.get("/", async (req, res) => {
  try {
    const data = await Faculty.getAllWithAllocation();
    res.json(data);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/stats", async (req, res) => {
  try {
    const stats = await Faculty.count();
    res.json(stats);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/", async (req, res) => {
  try {
    await Faculty.create(req.body);
    res.json({ message: "Faculty added successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Faculty already exists" });
    }
    res.status(500).json(err);
  }
});

router.put("/:id/max-classrooms", async (req, res) => {
  try {
    await Faculty.updateMaxClassrooms(
      req.params.id,
      req.body.max_classrooms
    );
    res.json({ message: "Max classrooms updated" });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Faculty.deleteById(req.params.id);
    res.json({ message: "Faculty deleted" });
  } catch (err) {
    res.status(500).json(err);
  }
});

// ✅ FIXED: Changed from 403 to 200 with allowed boolean
router.get("/:id/can-allocate", async (req, res) => {
  try {
    const facultyId = req.params.id;
    const canAllocate = await Faculty.canAllocate(facultyId);
    
    // Always return 200 with allowed status
    res.json({ 
      allowed: canAllocate,
      message: canAllocate 
        ? "Faculty can be allocated" 
        : "Faculty has reached maximum allocation limit"
    });
  } catch (err) {
    console.error("Error checking faculty allocation:", err);
    res.status(500).json({ 
      error: err.message,
      allowed: false 
    });
  }
});

module.exports = router;