"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const workers_1 = __importDefault(require("./routes/workers"));
const shifts_1 = __importDefault(require("./routes/shifts"));
const schedules_1 = __importDefault(require("./routes/schedules"));
const shiftRequests_1 = __importDefault(require("./routes/shiftRequests"));
const auth_2 = require("./middleware/auth");
const prisma_1 = __importDefault(require("./prisma"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', (0, cors_1.default)());
app.use(express_1.default.json());
// Routes publik (tanpa auth)
app.use('/api/auth', auth_1.default);
// Routes yang butuh auth
app.use('/api/workers', auth_2.authMiddleware, workers_1.default);
app.use('/api/shifts', auth_2.authMiddleware, shifts_1.default);
app.use('/api/schedules', auth_2.authMiddleware, schedules_1.default);
app.use('/api/shift-requests', auth_2.authMiddleware, shiftRequests_1.default);
// Health & DB status check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'DSS Healthcare Scheduler API berjalan' });
});
app.get('/api/db-status', async (_req, res) => {
    try {
        const [workersCount, shiftsCount, schedulesCount, usersCount, requestsCount, assignmentsCount] = await Promise.all([
            prisma_1.default.worker.count(),
            prisma_1.default.shift.count(),
            prisma_1.default.schedule.count(),
            prisma_1.default.user.count(),
            prisma_1.default.shiftRequest.count(),
            prisma_1.default.assignment.count(),
        ]);
        res.json({
            status: 'connected',
            counts: {
                workers: workersCount,
                shifts: shiftsCount,
                schedules: schedulesCount,
                users: usersCount,
                requests: requestsCount,
                assignments: assignmentsCount,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
        });
    }
});
// Start server (hanya saat berjalan lokal)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`\n🏥 DSS Healthcare Scheduler API`);
        console.log(`   Server berjalan di http://localhost:${PORT}`);
        console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
    });
}
exports.default = app;
//# sourceMappingURL=index.js.map