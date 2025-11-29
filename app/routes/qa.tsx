import { useState, useCallback } from "react";
import { useLoaderData, useRevalidator, useFetcher } from "react-router";
import type { Route } from "./+types/qa";
import { getUserFromRequest, createUser, createUserCookie, findUserByName, loginUser } from "~/lib/session.server";
import { getQuestions, createQuestion, upvoteQuestion, resolveQuestion } from "~/lib/qa.server";
import { broadcastNewQuestion, broadcastQuestionUpdate } from "~/lib/websocket.server";
import { QuestionItem, type Question } from "~/components/QuestionItem";
import { useWebSocket } from "~/hooks/useWebSocket";
import { NamePrompt } from "~/components/NamePrompt";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  
  if (!user) {
    return { user: null, questions: [] };
  }

  const questions = await getQuestions(user.id);
  return { user, questions };
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
        Location: "/qa",
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
        Location: "/qa",
      },
    });
  }

  const user = await getUserFromRequest(request);
  if (!user) return { error: "Unauthorized" };

  if (intent === "add_question") {
    const content = formData.get("content") as string;
    if (!content?.trim()) return { error: "Content required" };

    const question = await createQuestion(user.id, content);
    broadcastNewQuestion(question, user.id);
    return { success: true };
  }

  if (intent === "upvote") {
    const questionId = formData.get("questionId") as string;
    const updated = await upvoteQuestion(user.id, questionId);
    if (updated) broadcastQuestionUpdate(updated);
    return { success: true };
  }

  if (intent === "resolve") {
    const questionId = formData.get("questionId") as string;
    try {
      const updated = await resolveQuestion(user.id, questionId);
      broadcastQuestionUpdate(updated);
      return { success: true };
    } catch (error) {
      return { error: "Unauthorized" };
    }
  }

  return { error: "Invalid intent" };
}

export default function QAPage() {
  const { user, questions } = useLoaderData<typeof loader>();
  const [newQuestion, setNewQuestion] = useState("");
  const revalidator = useRevalidator();
  const fetcher = useFetcher();

  const handleWebSocketMessage = useCallback((message: any) => {
    if (
      message.type === "question_added" ||
      message.type === "question_updated"
    ) {
      revalidator.revalidate();
    }
  }, [revalidator]);
  
  const { connectionStatus } = useWebSocket(
    handleWebSocketMessage,
    user?.id,
    user?.name
  );

  if (!user) {
    return (
      <>
        <NamePrompt />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-500">Please enter your name to join the Q&A.</p>
        </div>
      </>
    );
  }

  const handleUpvote = (questionId: string) => {
    fetcher.submit(
      { intent: "upvote", questionId },
      { method: "post" }
    );
  };

  const handleResolve = (questionId: string) => {
    fetcher.submit(
      { intent: "resolve", questionId },
      { method: "post" }
    );
  };

  const handleSubmitQuestion = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    
    fetcher.submit(
      { intent: "add_question", content: newQuestion },
      { method: "post" }
    );
    setNewQuestion("");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Q&A Session</h1>
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "reconnecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-sm text-gray-600">
            {connectionStatus === "connected" ? "Live" : connectionStatus}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-8">
        <form onSubmit={handleSubmitQuestion}>
          <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
            Ask a question anonymously
          </label>
          <textarea
            id="question"
            name="content"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Type your question here..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            required
          />
          <div className="flex justify-end mt-3">
            <button
              type="submit"
              disabled={!newQuestion.trim() || fetcher.state !== "idle"}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fetcher.state !== "idle" ? "Asking..." : "Ask Question"}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p>No questions yet. Be the first to ask!</p>
          </div>
        ) : (
          questions.map((q: Question) => (
            <QuestionItem
              key={q.id}
              question={q}
              onUpvote={handleUpvote}
              onResolve={handleResolve}
              isAdmin={user.isAdmin}
            />
          ))
        )}
      </div>
    </div>
  );
}

