# FuFa - Social Feed & Meme Platform

A real-time social platform with live feed and meme creation/voting features.

## Features

- **Live Feed**: Real-time post creation and threaded comments using WebSockets
- **Meme Generator**: Create memes using Imgflip templates or custom images
- **Voting System**: Upvote and downvote memes
- **Admin Controls**: Admins can moderate content by deleting posts and memes
- **Anonymous Users**: Simple cookie-based sessions with username prompt

## Tech Stack

- **Framework**: React Router v7 (Remix architecture)
- **Database**: SQLite with Prisma ORM
- **Real-time**: WebSockets (ws library)
- **Image Processing**: Sharp
- **Styling**: Tailwind CSS
- **Deployment**: Docker with ARM64 support

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd fufa
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
DATABASE_URL="file:./dev.db"
IMGFLIP_USERNAME="your_imgflip_username"
IMGFLIP_PASSWORD="your_imgflip_password"
```

4. Initialize the database:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Imgflip Setup

To use meme templates, you need an Imgflip account:

1. Sign up at [https://imgflip.com/signup](https://imgflip.com/signup)
2. Add your credentials to the `.env` file

## Admin Setup

To make a user an admin:

1. Start the application and create a user account
2. Find the user ID in the database
3. Update the user using Prisma Studio:
```bash
npx prisma studio
```
4. Or use SQL:
```sql
UPDATE User SET isAdmin = true WHERE id = 'user_id';
```

## Building for Production

```bash
npm run build
npm run start
```

## Docker Deployment

Build the Docker image:
```bash
docker build -t fufa .
```

Run the container:
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./prod.db" \
  -e IMGFLIP_USERNAME="your_username" \
  -e IMGFLIP_PASSWORD="your_password" \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/public/uploads \
  fufa
```

## CI/CD with GitHub Actions

The repository includes a GitHub Actions workflow that automatically builds and pushes Docker images for ARM64 architecture.

### Required GitHub Secrets

Configure these secrets in your repository settings:

- `DOCKER_REGISTRY_URL`: Your private Docker registry URL (e.g., `registry.example.com`)
- `DOCKER_USERNAME`: Registry username
- `DOCKER_PASSWORD`: Registry password or access token

The workflow triggers on:
- Push to `main` or `master` branch
- Release publication

Images are tagged with:
- `latest` for branch pushes
- Git tag name for releases
- Short commit SHA (7 characters)

## Project Structure

```
app/
├── components/       # React components
├── hooks/           # Custom React hooks
├── lib/             # Server-side utilities
├── routes/          # Route handlers (pages)
└── root.tsx         # Root layout

prisma/
└── schema.prisma    # Database schema

public/
└── uploads/         # User-uploaded content

.github/
└── workflows/       # CI/CD pipelines
```

## API Endpoints

### Posts
- `POST /` - Create a new post or reply
- `DELETE /` - Delete a post (admin only)

### Memes
- `POST /memes` - Create a meme from template or upload
- `POST /memes` - Vote on a meme
- `DELETE /memes` - Delete a meme (admin only)

## License

This project is private and proprietary.
