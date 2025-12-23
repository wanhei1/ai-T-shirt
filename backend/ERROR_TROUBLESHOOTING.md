# 错误排查总结

## 错误1: Property 'userId' does not exist on type 'Request'

**错误信息:**
```
TSError: ⨯ Unable to compile TypeScript:
src/routes/index.ts:21:59 - error TS2339: Property 'userId' does not exist on type 'Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>'.
```

**原因:** 
Express 的 Request 类型默认没有 `userId` 属性，但我们在中间件中添加了这个属性。

**解决方案:**
1. 创建类型扩展文件 `src/types/index.ts`
2. 扩展 Express.Request 接口
3. 在主应用文件中导入类型扩展

**代码:**
```typescript
// src/types/index.ts
declare global {
    namespace Express {
        interface Request {
            userId?: number;
        }
    }
}
export {};

// src/app.ts
import './types'; // 导入类型扩展
```

## 错误2: Argument of type 'number | undefined' is not assignable to parameter of type 'number'

**错误信息:**
```
TSError: ⨯ Unable to compile TypeScript:
src/routes/index.ts:21:55 - error TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
Type 'undefined' is not assignable to type 'number'.
```

**原因:** 
`req.userId` 的类型是 `number | undefined`，但函数参数期望 `number` 类型。

**解决方案:**
添加类型检查，确保 `userId` 存在再使用。

**代码:**
```typescript
// 在使用 req.userId 之前添加检查
if (!req.userId) {
    return res.status(401).json({ message: 'User ID not found' });
}
const user = await userModel.findUserById(req.userId);
```

## 常见 TypeScript 错误处理模式

### 1. 可选属性处理
```typescript
// 错误方式
const result = someOptionalValue.method(); // 如果 someOptionalValue 是 undefined 会报错

// 正确方式
if (someOptionalValue) {
    const result = someOptionalValue.method();
}
// 或使用可选链
const result = someOptionalValue?.method();
```

### 2. 联合类型处理
```typescript
// 错误方式
function process(value: string | number) {
    return value.toUpperCase(); // number 没有 toUpperCase 方法
}

// 正确方式
function process(value: string | number) {
    if (typeof value === 'string') {
        return value.toUpperCase();
    }
    return value.toString();
}
```

### 3. Express 类型扩展
```typescript
// 扩展 Express Request 接口
declare global {
    namespace Express {
        interface Request {
            customProperty?: any;
        }
    }
}
```

## 运行步骤总结

1. **安装依赖**
   ```bash
   npm install
   ```

2. **设置环境变量**
   - 确保 `.env` 文件中的 `DATABASE_URL` 正确
   - 设置 `JWT_SECRET`

3. **运行项目**
   ```bash
   npm run dev
   ```

4. **测试 API**
   - 注册: `POST /api/register`
   - 登录: `POST /api/login`
   - 获取用户信息: `GET /api/profile` (需要 Bearer token)

## 注意事项

- 确保所有类型定义文件被正确导入
- 处理可选属性时要添加类型检查
- 使用 TypeScript 的严格模式可以提前发现潜在问题
- 定期检查类型错误，不要使用 `any` 类型逃避问题