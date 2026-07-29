"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const prisma_1 = __importDefault(require("../prisma"));
// GET /api/workers - Daftar semua tenaga kerja
router.get('/', async (_req, res) => {
    try {
        const workers = await prisma_1.default.worker.findMany({
            orderBy: { name: 'asc' },
        });
        res.json(workers);
    }
    catch (error) {
        console.error('Get workers error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// GET /api/workers/:id - Detail tenaga kerja
router.get('/:id', async (req, res) => {
    try {
        const worker = await prisma_1.default.worker.findUnique({
            where: { id: parseInt(req.params.id) },
        });
        if (!worker) {
            res.status(404).json({ error: 'Tenaga kerja tidak ditemukan' });
            return;
        }
        res.json(worker);
    }
    catch (error) {
        console.error('Get worker error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// POST /api/workers - Tambah tenaga kerja (admin only)
router.post('/', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const { name, workerType, skillLevel, fixedShift, weekendHolidayOff, sundayHolidayOff } = req.body;
        if (!name || !workerType || !skillLevel) {
            res.status(400).json({ error: 'Nama, tipe, dan level skill wajib diisi' });
            return;
        }
        const worker = await prisma_1.default.worker.create({
            data: {
                name,
                workerType,
                skillLevel,
                fixedShift: fixedShift || null,
                weekendHolidayOff: !!weekendHolidayOff,
                sundayHolidayOff: !!sundayHolidayOff,
            },
        });
        res.status(201).json(worker);
    }
    catch (error) {
        console.error('Create worker error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// PUT /api/workers/:id - Update tenaga kerja (admin only)
router.put('/:id', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        const { name, workerType, skillLevel, isActive, fixedShift, weekendHolidayOff, sundayHolidayOff } = req.body;
        const worker = await prisma_1.default.worker.update({
            where: { id: parseInt(req.params.id) },
            data: {
                ...(name && { name }),
                ...(workerType && { workerType }),
                ...(skillLevel && { skillLevel }),
                ...(isActive !== undefined && { isActive }),
                fixedShift: fixedShift !== undefined ? (fixedShift || null) : undefined,
                weekendHolidayOff: weekendHolidayOff !== undefined ? !!weekendHolidayOff : undefined,
                sundayHolidayOff: sundayHolidayOff !== undefined ? !!sundayHolidayOff : undefined,
            },
        });
        res.json(worker);
    }
    catch (error) {
        console.error('Update worker error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
// DELETE /api/workers/:id - Hapus tenaga kerja (admin only)
router.delete('/:id', async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            res.status(403).json({ error: 'Akses hanya untuk admin' });
            return;
        }
        await prisma_1.default.worker.delete({
            where: { id: parseInt(req.params.id) },
        });
        res.json({ message: 'Tenaga kerja berhasil dihapus' });
    }
    catch (error) {
        console.error('Delete worker error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});
exports.default = router;
//# sourceMappingURL=workers.js.map