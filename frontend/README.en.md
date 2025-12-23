# Frontend Application (Next.js)

This directory contains the Next.js frontend for the custom T-shirt designer platform. The app provides a full design workflow, account management, and integration with the backend API.

## ✨ Key Features

- AI-assisted and manual design tools for T-shirt customization
- Authentication flows (register, log in, profile management)
- Responsive UI built with Tailwind CSS and Radix UI components
- Integration with the backend API (`NEXT_PUBLIC_API_URL`) for data access
- ComfyUI health status card and API connectivity debugging helpers

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS, Shadcn UI components, Embla Carousel
- **State & Forms:** React Hook Form, Zod validation, custom React context
- **Charts & UI Enhancements:** Recharts, Lucide icons, Sonner toasts

## 📁 Directory Structure

```
frontend/
├── app/                 # Route handlers (App Router)
│   ├── page.tsx         # Landing page
│   ├── auth/            # Authentication pages
│   ├── design/          # Design workflow UI
│   └── profile/         # User dashboard
├── components/          # Reusable UI and domain components
├── contexts/            # React context (e.g., AuthContext)
├── hooks/               # Custom hooks
├── lib/                 # API clients, utilities, workflows
├── public/              # Static assets
├── styles/              # Global styles
└── types/               # Shared TypeScript types
```

## ⚙️ Environment Variables

Create `frontend/.env.local` (ignored by git) and configure:

```dotenv
# Base URL for the backend API
NEXT_PUBLIC_API_URL=http://localhost:3002
```

If you deploy the backend elsewhere, update this URL accordingly.

## 🚀 Development

Install dependencies (Bun is recommended for this repo):

```bash
bun install
```

Run the development server:

```bash
bun run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Additional scripts

```bash
bun run build   # Production build
bun run start   # Start Next.js in production mode (after build)
bun run lint    # Run ESLint checks
```

## 🔗 Backend Integration

The frontend expects the backend API to expose the following routes (see `backend/README.md` for details):

- `POST /api/auth/register` – Create a new account
- `POST /api/auth/login` – Obtain a JWT token
- `GET /api/profile` – Retrieve current user profile (requires Authorization header)
- `POST /api/designs` – Submit design data

Ensure your backend server is running on the same base URL configured in `NEXT_PUBLIC_API_URL`.

## 🧪 Testing Account

A shared testing account is available:

- Email: `yeesiangku@gmail.com`
- Password: `123456`

Use it to quickly verify auth flows without creating a new user.

## 🤝 Contributing

1. Fork the repository and clone your fork.
2. Create a feature branch: `git checkout -b feat/amazing-ui`
3. Commit changes: `git commit -m "feat: improve landing page copy"`
4. Push the branch and open a pull request.

Before submitting a PR, please run `bun run lint` and verify the app builds.

## 📄 License

This project is released under the MIT License. See the root `LICENSE` file if available.
