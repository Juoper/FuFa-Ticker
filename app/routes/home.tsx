import { useState, useCallback } from "react";
import { Form, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/home";
import { getUserFromRequest, createUser, createUserCookie } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { NamePrompt } from "~/components/NamePrompt";
import { PostItem } from "~/components/PostItem";
import { useWebSocket } from "~/hooks/useWebSocket";
import { broadcastNewPost, broadcastDeletePost } from "~/lib/websocket.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return { user: null, posts: [] };
  }

  const posts = await prisma.post.findMany({
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
  });

  return { user, posts };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle user registration
  if (intent === "register") {
    const name = formData.get("name") as string;
    if (!name || !name.trim()) {
      return { error: "Name is required" };
    }

    const user = await createUser(name);
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

  return { error: "Invalid intent" };
}

export default function Home() {
  const { user, posts } = useLoaderData<typeof loader>();
  const [postContent, setPostContent] = useState("");
  const revalidator = useRevalidator();

  // WebSocket for real-time updates
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === "new_post" || message.type === "delete_post") {
      revalidator.revalidate();
    }
  }, [revalidator]);

  const { isConnected } = useWebSocket(handleWebSocketMessage);

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Live Feed</h1>
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm text-gray-600">
            {isConnected ? "Live" : "Disconnected"}
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
  );
}
