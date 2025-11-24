import { Form } from "react-router";

interface Meme {
  id: string;
  imageUrl: string;
  createdAt: string;
  user: {
    name: string;
  };
  upvotes: number;
  downvotes: number;
  userVote?: string | null;
}

interface MemeCardProps {
  meme: Meme;
  isAdmin: boolean;
}

export function MemeCard({ meme, isAdmin }: MemeCardProps) {
  const score = meme.upvotes - meme.downvotes;
  const timeAgo = getTimeAgo(new Date(meme.createdAt));

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="relative w-full" style={{ maxHeight: "400px", overflow: "hidden" }}>
        <img
          src={meme.imageUrl}
          alt="Meme"
          className="w-full h-auto object-contain"
          style={{ maxHeight: "400px" }}
          loading="lazy"
        />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-gray-600">by {meme.user.name}</p>
            <p className="text-xs text-gray-500">{timeAgo}</p>
          </div>
          {isAdmin && (
            <Form method="post">
              <input type="hidden" name="intent" value="deleteMeme" />
              <input type="hidden" name="memeId" value={meme.id} />
              <button
                type="submit"
                className="text-red-500 hover:text-red-700 text-sm"
                onClick={(e) => {
                  if (!confirm("Are you sure you want to delete this meme?")) {
                    e.preventDefault();
                  }
                }}
              >
                Delete
              </button>
            </Form>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <Form method="post" className="flex items-center space-x-2">
            <input type="hidden" name="intent" value="vote" />
            <input type="hidden" name="memeId" value={meme.id} />
            <input type="hidden" name="voteType" value="up" />
            <button
              type="submit"
              className={`p-2 rounded hover:bg-gray-100 transition ${
                meme.userVote === "up" ? "text-green-500" : "text-gray-500"
              }`}
              disabled={meme.userVote === "up"}
            >
              ▲
            </button>
          </Form>
          <span
            className={`font-bold ${
              score > 0
                ? "text-green-600"
                : score < 0
                ? "text-red-600"
                : "text-gray-600"
            }`}
          >
            {score}
          </span>
          <Form method="post" className="flex items-center space-x-2">
            <input type="hidden" name="intent" value="vote" />
            <input type="hidden" name="memeId" value={meme.id} />
            <input type="hidden" name="voteType" value="down" />
            <button
              type="submit"
              className={`p-2 rounded hover:bg-gray-100 transition ${
                meme.userVote === "down" ? "text-red-500" : "text-gray-500"
              }`}
              disabled={meme.userVote === "down"}
            >
              ▼
            </button>
          </Form>
        </div>
      </div>
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

