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
        pin: true,
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

async function generateUniquePin(): Promise<string> {
  const maxAttempts = 100;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate a random 2-digit PIN (10-99)
    const pin = String(Math.floor(Math.random() * 90) + 10);
    
    // Check if this PIN is already taken
    const existingUser = await prisma.user.findUnique({
      where: { pin },
    });
    
    if (!existingUser) {
      return pin;
    }
  }
  
  throw new Error("Unable to generate unique PIN after multiple attempts");
}

export async function findUserByName(name: string) {
  // Find user with case-insensitive name matching
  // SQLite doesn't support mode: 'insensitive', so we fetch all users and filter in JS
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      pin: true,
      isAdmin: true,
      createdAt: true,
    },
  });
  
  const trimmedName = name.trim().toLowerCase();
  const matchedUser = users.find(
    (user) => user.name.toLowerCase() === trimmedName
  );
  
  return matchedUser || null;
}

export async function loginUser(name: string, pin: string) {
  const user = await findUserByName(name);
  
  if (!user) {
    return { success: false, error: "User not found" };
  }
  
  if (user.pin !== pin) {
    return { success: false, error: "Incorrect PIN" };
  }
  
  return { success: true, user };
}

export async function createUser(name: string) {
  const pin = await generateUniquePin();
  
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      pin,
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

