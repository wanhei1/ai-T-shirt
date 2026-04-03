import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models';
import { hashPassword, comparePassword } from '../utils';

export class AuthController {
    constructor(private userModel: UserModel) {}

    private normalizeEmail(input: unknown): string {
        if (typeof input !== 'string') return '';
        return input.trim().toLowerCase();
    }

    private normalizeUsername(input: unknown): string {
        if (typeof input !== 'string') return '';
        return input.trim();
    }

    async register(req: Request, res: Response) {
        try {
            const username = this.normalizeUsername(req.body?.username);
            const email = this.normalizeEmail(req.body?.email);
            const password = typeof req.body?.password === 'string' ? req.body.password : '';

            if (!username || !email || password.length < 6) {
                return res.status(400).json({ message: 'Invalid registration payload' });
            }

            // 检查用户是否已存在
            const existingUser = await this.userModel.findUserByEmail(email);
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // 密码加密
            const hashedPassword = await hashPassword(password);

            // 创建用户
            const user = await this.userModel.createUser(username, email, hashedPassword);

            // Ensure invite code exists
            const invite_code = await this.userModel.getOrCreateInviteCode(user.id);

            // 生成JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET || 'your_secret_key',
                { expiresIn: '24h' }
            );

            res.status(201).json({
                message: 'User created successfully',
                token,
                user: { id: user.id, username: user.username, email: user.email, invite_code, is_admin: (user as any).is_admin ?? false }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const email = this.normalizeEmail(req.body?.email);
            const password = typeof req.body?.password === 'string' ? req.body.password : '';

            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }

            // 查找用户
            const user = await this.userModel.findUserByEmail(email);
            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // 验证密码
            const isValidPassword = await comparePassword(password, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // 生成JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET || 'your_secret_key',
                { expiresIn: '24h' }
            );

            const invite_code = await this.userModel.getOrCreateInviteCode(user.id);

            res.json({
                message: 'Login successful',
                token,
                user: { id: user.id, username: user.username, email: user.email, invite_code, is_admin: (user as any).is_admin ?? false }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}