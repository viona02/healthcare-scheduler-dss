"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'healthcare-scheduler-dss-secret-key-2024';
}
const globalForPrisma = global;
function getSqliteClient() {
    const possiblePaths = [
        path_1.default.resolve(__dirname, '..', 'prisma', 'dev.db'),
        path_1.default.resolve(__dirname, 'prisma', 'dev.db'),
        path_1.default.resolve(process.cwd(), 'server', 'prisma', 'dev.db'),
        path_1.default.resolve(process.cwd(), 'prisma', 'dev.db'),
        '/var/task/server/prisma/dev.db',
        '/var/task/prisma/dev.db',
    ];
    let sourcePath = possiblePaths.find(p => fs_1.default.existsSync(p)) || possiblePaths[0];
    let sqlitePath = sourcePath;
    // On Vercel / serverless environment, /var/task is read-only.
    // Copy dev.db ONCE to /tmp/dev.db if it doesn't exist yet, so write operations succeed without corrupting open handle.
    if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        const tmpPath = path_1.default.join('/tmp', 'dev.db');
        try {
            if (!fs_1.default.existsSync(tmpPath) && fs_1.default.existsSync(sourcePath)) {
                fs_1.default.copyFileSync(sourcePath, tmpPath);
                console.log(`[Prisma] Copied dev.db from ${sourcePath} to /tmp/dev.db once for full read/write support on Vercel`);
            }
            if (fs_1.default.existsSync(tmpPath)) {
                sqlitePath = tmpPath;
            }
        }
        catch (e) {
            console.warn('[Prisma] Failed to copy dev.db to /tmp:', e);
        }
    }
    console.log(`[Prisma] Using SQLite database at: ${sqlitePath}`);
    const sqliteUrl = `file:${sqlitePath}`;
    process.env.SQLITE_DATABASE_URL = sqliteUrl;
    const { PrismaClient: SqlitePrismaClient } = require('../generated-sqlite-client');
    return new SqlitePrismaClient({
        datasources: {
            db: {
                url: sqliteUrl,
            },
        },
    });
}
function createPrismaClient() {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl || dbUrl.startsWith('file:') || dbUrl.includes('.db') || process.env.VERCEL === '1') {
        return getSqliteClient();
    }
    // PostgreSQL Client (@prisma/client) with SQLite fallback proxy
    let PostgresPrismaClient;
    try {
        PostgresPrismaClient = require('@prisma/client').PrismaClient;
    }
    catch (e) {
        return getSqliteClient();
    }
    const postgresClient = new PostgresPrismaClient({
        datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
        log: ['error', 'warn'],
    });
    let sqliteClientInstance = null;
    function getFallbackSqlite() {
        if (!sqliteClientInstance) {
            sqliteClientInstance = getSqliteClient();
        }
        return sqliteClientInstance;
    }
    // Wrap postgresClient in Proxy for automatic fallback on DB errors
    return new Proxy(postgresClient, {
        get(target, propKey, receiver) {
            const origProp = Reflect.get(target, propKey, receiver);
            // Model access like prisma.worker, prisma.schedule, etc.
            if (typeof origProp === 'object' && origProp !== null) {
                return new Proxy(origProp, {
                    get(modelTarget, methodKey) {
                        const origMethod = Reflect.get(modelTarget, methodKey);
                        if (typeof origMethod === 'function') {
                            return async function (...args) {
                                try {
                                    return await origMethod.apply(modelTarget, args);
                                }
                                catch (err) {
                                    console.warn(`[Prisma Failover] PostgreSQL query failed (${err.message}). Falling back to SQLite dev.db...`);
                                    const fallbackSqlite = getFallbackSqlite();
                                    const sqliteModel = fallbackSqlite[propKey];
                                    if (sqliteModel && typeof sqliteModel[methodKey] === 'function') {
                                        return await sqliteModel[methodKey](...args);
                                    }
                                    throw err;
                                }
                            };
                        }
                        return origMethod;
                    },
                });
            }
            // Top-level methods like prisma.$transaction, etc.
            if (typeof origProp === 'function') {
                return async function (...args) {
                    try {
                        return await origProp.apply(target, args);
                    }
                    catch (err) {
                        console.warn(`[Prisma Failover] PostgreSQL query failed (${err.message}). Falling back to SQLite dev.db...`);
                        const fallbackSqlite = getFallbackSqlite();
                        const sqliteMethod = fallbackSqlite[propKey];
                        if (typeof sqliteMethod === 'function') {
                            return await sqliteMethod.apply(fallbackSqlite, args);
                        }
                        throw err;
                    }
                };
            }
            return origProp;
        },
    });
}
exports.prisma = globalForPrisma.prisma || createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map