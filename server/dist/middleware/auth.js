"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.authMiddleware = authMiddleware;
exports.adminOnly = adminOnly;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    return process.env.JWT_SECRET || 'healthcare-scheduler-dss-secret-key-2024';
}
function generateToken(userId, role) {
    return jsonwebtoken_1.default.sign({ userId, role }, getJwtSecret(), { expiresIn: '24h' });
}
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token tidak ditemukan' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    }
    catch {
        res.status(401).json({ error: 'Token tidak valid atau expired' });
    }
}
function adminOnly(req, res, next) {
    if (req.userRole !== 'admin') {
        res.status(403).json({ error: 'Akses hanya untuk admin' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map