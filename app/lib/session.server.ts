import { parse, serialize } from "cookie";
import { prisma } from "./db.server";

const COOKIE_NAME = "userId";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function getUserFromRequest(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parse(cookieHeader);
  const userId = cookies[COOKIE_NAME];

  if (!userId) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

export async function createUser(name: string) {
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
    },
  });

  return user;
}

export function createUserCookie(userId: string) {
  return serialize(COOKIE_NAME, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
}

export async function requireUser(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

