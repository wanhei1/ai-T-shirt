### T恤设计师 - Neon Database & Drizzle Setup

This README provides instructions for setting up and configuring Neon (serverless Postgres) with Drizzle ORM to store user data, design data, and orders for the T-shirt design platform.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setting Up Neon Database](#setting-up-neon-database)
- [Installing Dependencies](#installing-dependencies)
- [Configuring Database Connection](#configuring-database-connection)
- [Creating Schema with Drizzle](#creating-schema-with-drizzle)
- [Setting Up Environment Variables](#setting-up-environment-variables)
- [Implementing API Routes](#implementing-api-routes)
- [Authentication System](#authentication-system)
- [Design Management](#design-management)
- [Order Processing](#order-processing)
- [Testing the Setup](#testing-the-setup)
- [Migrating the Database](#migrating-the-database)
- [Frontend Integration Examples](#frontend-integration-examples)

## Prerequisites

- Node.js (v18+) or Bun runtime
- A Neon account (sign up at [https://neon.tech](https://neon.tech))
- Basic knowledge of TypeScript and Next.js
- Understanding of T-shirt design workflows

## Setting Up Neon Database

1. **Create a Neon Account**: Sign up at [Neon.tech](https://neon.tech)

2. **Create a New Project**: 
   - Project Name: `tshirt-designer-db`
   - Region: Choose closest to your users
   - Postgres Version: 15 (recommended)

3. **Get Connection String**: Copy the connection string from your Neon dashboard
   ```
   postgres://username:password@ep-example.neon.tech/tshirtdesigner?sslmode=require
   ```  

## Installing Dependencies

Add the required packages to your project:

```bash
# Using Bun (recommended)
bun add drizzle-orm @neondatabase/serverless dotenv
bun add -D drizzle-kit @types/pg

# Using npm
npm install drizzle-orm @neondatabase/serverless dotenv
npm install -D drizzle-kit @types/pg

# Authentication dependencies
bun add bcryptjs jsonwebtoken
bun add -D @types/bcryptjs @types/jsonwebtoken
```

## Configuring Database Connection

Create a new file in your project at `lib/db.ts`:

```typescript
// lib/db.ts
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create Drizzle ORM instance
export const db = drizzle(pool);
```

## Creating Schema with Drizzle

Create a new directory `db/schema` and add files for your tables:

### Users Table

```typescript
// db/schema/users.ts
import { serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  isEmailVerified: boolean('is_email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Designs Table

```typescript
// db/schema/designs.ts
import { serial, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { users } from './users';

export const designs = pgTable('designs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  designData: jsonb('design_data').notNull(), // 存储设计的JSON数据
  thumbnailUrl: text('thumbnail_url'),
  imageUrls: text('image_urls').array(), // 生成的图片URLs
  tags: text('tags').array(), // 设计标签
  style: text('style'), // 设计风格 (realistic, cartoon, anime, etc.)
  tshirtColor: text('tshirt_color').default('white'),
  designPosition: text('design_position').default('center'), // front, back, center
  isPublic: boolean('is_public').default(false),
  likes: integer('likes').default(0),
  views: integer('views').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Orders Table

```typescript
// db/schema/orders.ts
import { serial, text, timestamp, decimal, integer, jsonb } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { users } from './users';
import { designs } from './designs';

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  designId: integer('design_id').references(() => designs.id).notNull(),
  orderNumber: text('order_number').notNull().unique(),
  customerInfo: jsonb('customer_info').notNull(), // 客户信息
  shippingAddress: jsonb('shipping_address').notNull(),
  tshirtSize: text('tshirt_size').notNull(), // S, M, L, XL, XXL
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  status: text('status').default('pending'), // pending, processing, shipped, delivered, cancelled
  paymentStatus: text('payment_status').default('pending'), // pending, paid, failed, refunded
  trackingNumber: text('tracking_number'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Sessions Table

```typescript
// db/schema/sessions.ts
import { serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { users } from './users';

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  sessionToken: text('session_token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Index File

```typescript
// db/schema/index.ts
export * from './users';
export * from './designs';
export * from './orders';
export * from './sessions';
```

## Setting Up Environment Variables  

Create a `.env.local` file in your project root:

```
# Neon Database
DATABASE_URL=postgres://username:password@ep-example.neon.tech/tshirtdesigner?sslmode=require

# JWT Secret for authentication
JWT_SECRET=your-super-secret-jwt-key

# ComfyUI Configuration
COMFYUI_URL=http://82.157.19.21:8188

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
```

## Authentication System

### JWT Authentication Helper

```typescript
// lib/auth.ts
import { NextRequest } from 'next/server';
import { verify } from 'jsonwebtoken';
import { db } from './db';
import { users, sessions } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export async function getCurrentUser(request?: NextRequest) {
  try {
    // Get token from cookie or Authorization header
    let token: string | undefined;
    
    if (request) {
      token = request.cookies.get('session-token')?.value ||
              request.headers.get('Authorization')?.replace('Bearer ', '');
    } else {
      // Server environment, get from cookies
      const { cookies } = await import('next/headers');
      token = cookies().get('session-token')?.value;
    }

    if (!token) return null;

    // Verify JWT
    const decoded = verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    
    // Check if session is still valid
    const [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.sessionToken, token),
          gt(sessions.expiresAt, new Date())
        )
      );

    if (!session) return null;

    // Get user info
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, decoded.userId));

    return user || null;

  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}
```

### User Registration API Route

```typescript
// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { db } from '@/lib/db';
import { users, sessions } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const { email, username, password } = await request.json();

    // Validate input
    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const [newUser] = await db.insert(users).values({
      email,
      username,
      passwordHash,
    }).returning();

    // Create session
    const sessionToken = sign({ userId: newUser.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(sessions).values({
      userId: newUser.id,
      sessionToken,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
      },
      token: sessionToken,
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### User Login API Route

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { db } from '@/lib/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    // Create session
    const sessionToken = sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(sessions).values({
      userId: user.id,
      sessionToken,
      expiresAt,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token: sessionToken,
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Design Management

### Design API Routes

```typescript
// app/api/designs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { designs } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const designData = await request.json();
    
    const [newDesign] = await db.insert(designs).values({
      userId: user.id,
      ...designData,
    }).returning();

    return NextResponse.json({ success: true, design: newDesign });

  } catch (error) {
    console.error('Design creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userDesigns = await db.select().from(designs).where(eq(designs.userId, user.id));

    return NextResponse.json({ success: true, designs: userDesigns });

  } catch (error) {
    console.error('Design fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Order Processing

### Orders API Routes

```typescript
// app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderData = await request.json();
    
    const [newOrder] = await db.insert(orders).values({
      userId: user.id,
      orderNumber: `TS-${nanoid(8)}`,
      ...orderData,
    }).returning();

    return NextResponse.json({ success: true, order: newOrder });

  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Migrating the Database

Set up Drizzle migrations:

1. Create a `drizzle.config.ts` file in your project root:

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default {
  schema: './db/schema/*',
  out: './db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  }
} satisfies Config;
```

2. Add migration scripts to your `package.json`:

```json
"scripts": {
  "db:generate": "drizzle-kit generate:pg",
  "db:migrate": "bun run db/migrations/migrate.ts",
  "db:push": "drizzle-kit push:pg",
  "db:studio": "drizzle-kit studio"
}
```

3. Create a migration script:

```typescript
// db/migrations/migrate.ts
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: 'db/migrations' });
  console.log('Migrations completed successfully');
  await pool.end();
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
```

## Testing the Setup

1. Generate migrations:
   ```bash
   bun run db:generate
   ```

2. Apply migrations:
   ```bash
   bun run db:migrate
   ```

3. Use Drizzle Studio to visualize your database:
   ```bash
   bun run db:studio
   ```

## Frontend Integration Examples

Update your T-shirt design components to interact with the API routes:

```typescript
// components/auth/register-form.tsx - User Registration
const onRegister = async (userData: RegisterData) => {
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const result = await response.json();

    if (result.success) {
      // Redirect to login or show success message
      router.push('/login');
    } else {
      setError(result.error);
    }
  } catch (error) {
    console.error('Registration failed:', error);
    setError('Registration failed. Please try again.');
  }
};
```

```typescript
// components/design/design-manager.tsx - Save Design
const saveDesign = async (designData: DesignData) => {
  try {
    const response = await fetch('/api/designs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(designData),
    });

    const result = await response.json();

    if (result.success) {
      setDesigns(prev => [...prev, result.design]);
    } else {
      console.error('Error saving design:', result.error);
    }
  } catch (error) {
    console.error('Error saving design:', error);
  }
};
```

## Additional Resources

- [Neon Documentation](https://neon.tech/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Next.js API Routes Documentation](https://nextjs.org/docs/api-routes/introduction)
- [ComfyUI API Documentation](https://github.com/comfyanonymous/ComfyUI)
- [JWT Authentication Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)