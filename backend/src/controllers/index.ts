import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models';
import { hashPassword, comparePassword } from '../utils';

export class AuthController {
    constructor(private userModel: UserModel) {}

    async register(req: Request, res: Response) {
        try {
            const { username, email, password } = req.body;

            // 检查用户是否已存在
            const existingUser = await this.userModel.findUserByEmail(email);
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists' });
            }

            // 密码加密
            const hashedPassword = await hashPassword(password);

            // 创建用户
            const user = await this.userModel.createUser(username, email, hashedPassword);

            // 生成JWT token
            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET || 'your_secret_key',
                { expiresIn: '24h' }
            );

            res.status(201).json({
                message: 'User created successfully',
                token,
                user: { id: user.id, username: user.username, email: user.email }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;

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

            res.json({
                message: 'Login successful',
                token,
                user: { id: user.id, username: user.username, email: user.email }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}