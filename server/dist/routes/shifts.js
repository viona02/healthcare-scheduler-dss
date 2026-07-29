"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const prisma_1 = __importDefault(require("../prisma"));
// GET /api/shifts - Semua shift
router.get('/', async (_req, res) => {
    try {
        const shifts = await prisma_1.default.shift.findMany({
            orderBy: { id: 'asc' },
        });
        res.json(shifts);
    }
    catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// PUT /api/shifts/:id - Update shift (admin only)
router.put('/:id', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const { name, startTime, endTime, durationHrs, minNurses, minMidwives, minSeniors } = req.body;
        const shift = await prisma_1.default.shift.update({
            where: { id: parseInt(req.params.id) },
            data: { name, startTime, endTime, durationHrs, minNurses, minMidwives, minSeniors },
        });
        res.json(shift);
    }
    catch (error) {
        console.error('Update shift error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
exports.default = router;
//# sourceMappingURL=shifts.js.map