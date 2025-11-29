import { useState } from "react";
import { Form } from "react-router";

interface Post {
  id: string;
  content: string;
  createdAt: string | Date;
  user: {
    name: string;
  };
  replies?: Post[];
}

interface PostItemProps {
  post: Post;
  isAdmin: boolean;
  depth?: number;
}

export function PostItem({ post, isAdmin, depth = 0 }: PostItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyContent, setReplyContent] = useState("");

  const hasReplies = post.replies && post.replies.length > 0;
  const timeAgo = getTimeAgo(new Date(post.createdAt));

  return (
    <div className={`${depth > 0 ? "ml-8 mt-4" : "mb-4"}`}>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <span className="font-semibold text-gray-900">{post.user.name}</span>
              <span className="text-gray-500 text-sm">·</span>
              <span className="text-gray-500 text-sm">{timeAgo}</span>
            </div>
            <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>
          </div>
          {isAdmin && (
            <Form method="post" className="ml-4">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="postId" value={post.id} />
              <button
                type="submit"
                className="text-red-500 hover:text-red-700 text-sm"
                onClick={(e) => {
                  if (!confirm("Are you sure you want to delete this post?")) {
                    e.preventDefault();
                  }
                }}
              >
                Delete
              </button>
            </Form>
          )}
        </div>

        <div className="flex items-center space-x-4 mt-3 text-sm">
          <button
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="text-blue-500 hover:text-blue-700"
          >
            Reply
          </button>
          {hasReplies && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="text-gray-500 hover:text-gray-700"
            >
              {showReplies ? "Hide" : "Show"} {post.replies!.length}{" "}
              {post.replies!.length === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>

        {showReplyForm && (
          <Form method="post" className="mt-3" onSubmit={() => setReplyContent("")}>
            <input type="hidden" name="intent" value="reply" />
            <input type="hidden" name="parentId" value={post.id} />
            <textarea
              name="content"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write a reply..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 bg-white placeholder:text-gray-500"
              rows={2}
              required
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                type="button"
                onClick={() => setShowReplyForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Reply
              </button>
            </div>
          </Form>
        )}
      </div>

      {showReplies && hasReplies && (
        <div className="mt-2">
          {post.replies!.map((reply) => (
            <PostItem key={reply.id} post={reply} isAdmin={isAdmin} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? "" : "s"} ago`;
    }
  }

  return "just now";
}

