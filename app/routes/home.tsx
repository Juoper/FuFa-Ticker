import { useState, useCallback } from "react";
import { Form, useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import { getUserFromRequest, createUser, createUserCookie, findUserByName, loginUser } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { NamePrompt } from "~/components/NamePrompt";
import { PostItem } from "~/components/PostItem";
import { Timetable } from "~/components/Timetable";
import { useWebSocket } from "~/hooks/useWebSocket";
import { broadcastNewPost, broadcastDeletePost } from "~/lib/websocket.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return { user: null, posts: [], timetableEntries: [] };
  }

  const [posts, timetableEntries] = await Promise.all([
    prisma.post.findMany({
      where: {
        parentId: null, // Only top-level posts
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.timetableEntry.findMany({
      orderBy: [
        { day: "asc" },
        { startTime: "asc" },
      ],
    }),
  ]);

  return { user, posts, timetableEntries };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle name checking (step 1 of authentication)
  if (intent === "check-name") {
    const name = formData.get("name") as string;
    if (!name || !name.trim()) {
      return { error: "Name is required" };
    }

    const existingUser = await findUserByName(name);
    
    if (existingUser) {
      // User exists, show login form
      return { step: "login", userName: existingUser.name };
    } else {
      // New user, create account and show PIN
      const user = await createUser(name);
      return { step: "signup", userName: user.name, generatedPin: user.pin };
    }
  }

  // Handle login with PIN
  if (intent === "login") {
    const name = formData.get("name") as string;
    const pin = formData.get("pin") as string;

    if (!name || !pin) {
      return { error: "Name and PIN are required", step: "login", userName: name };
    }

    const result = await loginUser(name, pin);
    
    if (!result.success) {
      return { error: result.error, step: "login", userName: name };
    }

    const cookie = createUserCookie(result.user!.id);

    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/",
      },
    });
  }

  // Handle completing signup (after showing PIN)
  if (intent === "complete-signup") {
    const name = formData.get("name") as string;
    
    if (!name) {
      return { error: "Name is required" };
    }

    const user = await findUserByName(name);
    
    if (!user) {
      return { error: "User not found" };
    }

    const cookie = createUserCookie(user.id);

    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/",
      },
    });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return { error: "Unauthorized" };
  }

  // Handle post creation
  if (intent === "post") {
    const content = formData.get("content") as string;
    if (!content || !content.trim()) {
      return { error: "Content is required" };
    }

    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        userId: user.id,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // Broadcast to all connected clients
    broadcastNewPost(post);

    return { success: true };
  }

  // Handle reply creation
  if (intent === "reply") {
    const content = formData.get("content") as string;
    const parentId = formData.get("parentId") as string;

    if (!content || !content.trim()) {
      return { error: "Content is required" };
    }

    const reply = await prisma.post.create({
      data: {
        content: content.trim(),
        userId: user.id,
        parentId,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // Broadcast to all connected clients
    broadcastNewPost(reply);

    return { success: true };
  }

  // Handle post deletion (admin only)
  if (intent === "delete") {
    if (!user.isAdmin) {
      return { error: "Forbidden" };
    }

    const postId = formData.get("postId") as string;
    await prisma.post.delete({
      where: { id: postId },
    });

    // Broadcast deletion to all connected clients
    broadcastDeletePost(postId);

    return { success: true };
  }

  // Handle timetable entry position update (admin only)
  if (intent === "update-timetable-position") {
    if (!user.isAdmin) {
      return { error: "Forbidden" };
    }
    
    const entryId = formData.get("entryId") as string;
    const day = formData.get("day") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;

    if (!entryId || !day || !startTime) {
      return { error: "Missing required fields" };
    }

    await prisma.timetableEntry.update({
      where: { id: entryId },
      data: {
        day,
        startTime,
        endTime: endTime || null,
      },
    });

    return { success: true };
  }

  // Handle timetable reset (admin only)
  if (intent === "reset-timetable") {
    if (!user.isAdmin) {
      return { error: "Forbidden" };
    }

    // Delete all existing entries
    await prisma.timetableEntry.deleteMany({});

    // Reseed with default data
    await prisma.timetableEntry.createMany({
      data: [
        // Friday
        { day: 'friday', startTime: '17:00', endTime: '19:00', content: 'Ankunft Küche?' },
        { day: 'friday', startTime: '19:00', endTime: '20:00', content: 'Abendessen (flexibel)' },
        { day: 'friday', startTime: '20:00', endTime: '21:00', content: 'Vorbereitung Versprechen' },
        { day: 'friday', startTime: '21:00', endTime: '22:00', content: 'Sekani Ankunft + Essen' },
        { day: 'friday', startTime: '22:00', endTime: '24:00', content: 'Losschicken' },
        
        // Saturday
        { day: 'saturday', startTime: '02:00', endTime: '08:00', content: 'Versprechen (flexibel) / Danach Schlaf' },
        { day: 'saturday', startTime: '08:00', endTime: '08:20', content: 'Wecken' },
        { day: 'saturday', startTime: '08:20', endTime: '08:30', content: 'Morgenrunde' },
        { day: 'saturday', startTime: '08:30', endTime: '09:30', content: 'Frühstück' },
        { day: 'saturday', startTime: '09:30', endTime: '10:30', content: 'Finanzvortrag' },
        { day: 'saturday', startTime: '10:30', endTime: '11:30', content: 'Stafu-Wahl' },
        { day: 'saturday', startTime: '13:00', endTime: '14:30', content: 'Mittagessen' },
        { day: 'saturday', startTime: '14:30', endTime: '17:00', content: 'Postenverabschiedung / SB-/SV-Postenvergabe' },
        { day: 'saturday', startTime: '17:00', endTime: '19:00', content: 'Verteilung Jahresberichte / Jahresplanung I' },
        { day: 'saturday', startTime: '19:00', endTime: '20:00', content: 'Abendessen' },
        { day: 'saturday', startTime: '20:00', endTime: '21:00', content: 'Freizeit' },
        
        // Sunday
        { day: 'sunday', startTime: '08:00', endTime: '08:20', content: 'Wecken' },
        { day: 'sunday', startTime: '08:20', endTime: '08:30', content: 'Morgenrunde' },
        { day: 'sunday', startTime: '08:30', endTime: '09:30', content: 'Frühstück' },
        { day: 'sunday', startTime: '09:30', endTime: '11:30', content: 'Jahresplanung II' },
        { day: 'sunday', startTime: '11:30', endTime: '13:00', content: 'Packen + Aufräumen' },
        { day: 'sunday', startTime: '13:00', endTime: '14:30', content: 'Snack' },
        { day: 'sunday', startTime: '14:00', endTime: '14:30', content: 'Abfahrt Haus' },
        { day: 'sunday', startTime: '14:30', endTime: '17:00', content: 'Abschlusskreis' },
      ],
    });

    return { success: true };
  }

  return { error: "Invalid intent" };
}

export default function Home() {
  const { user, posts, timetableEntries } = useLoaderData<typeof loader>();
  const [postContent, setPostContent] = useState("");
  const revalidator = useRevalidator();
  const fetcher = useFetcher();

  // WebSocket for real-time updates
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === "new_post" || message.type === "delete_post") {
      revalidator.revalidate();
    }
  }, [revalidator]);

  const { isConnected, connectionStatus } = useWebSocket(
    handleWebSocketMessage,
    user?.id,
    user?.name
  );

  if (!user) {
    return (
      <>
        <NamePrompt />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-500">Loading...</p>
        </div>
      </>
    );
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "reconnecting":
        return "bg-yellow-500";
      default:
        return "bg-red-500";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Live";
      case "reconnecting":
        return "Reconnecting...";
      default:
        return "Disconnected";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Timetable */}
      <Timetable entries={timetableEntries} isAdmin={user.isAdmin} />

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Live Feed</h1>
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${getStatusColor()} ${
                connectionStatus === "reconnecting" ? "animate-pulse" : ""
              }`}
            />
            <span className="text-sm text-gray-600">
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* New Post Form */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <Form
            method="post"
            onSubmit={(e) => {
              setTimeout(() => {
                setPostContent("");
                revalidator.revalidate();
              }, 100);
            }}
          >
            <input type="hidden" name="intent" value="post" />
            <textarea
              name="content"
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              required
            />
            <div className="flex justify-end mt-3">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300"
                disabled={!postContent.trim()}
              >
                Post
              </button>
            </div>
          </Form>
        </div>

        {/* Posts List */}
        <div>
          {posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No posts yet. Be the first to post!</p>
            </div>
          ) : (
            posts.map((post) => (
              <PostItem key={post.id} post={post} isAdmin={user.isAdmin} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
