import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 扩展 Request 接口
declare global {
    namespace Express {
        interface Request {
            userId?: number;
        }
    }
}

const secretKey = process.env.JWT_SECRET || 'your_secret_key';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Failed to authenticate token' });
        }

        // 确保 ID 被正确解析为数字
        const payload = decoded as any;
        req.userId = typeof payload.id === 'string' ? parseInt(payload.id, 10) : payload.id;
        next();
    });
};