import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    userId?: number;
    userRole?: string;
}
export declare function generateToken(userId: number, role: string): string;
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function adminOnly(req: AuthRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map