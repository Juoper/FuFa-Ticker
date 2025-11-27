import { formatDistanceToNow } from "date-fns";
import { CheckCircle, ThumbsUp } from "lucide-react";

export interface Question {
  id: string;
  content: string;
  upvotes: number;
  isUpvoted: boolean;
  resolved: boolean;
  isOwner: boolean;
  createdAt: string | Date;
}

interface QuestionItemProps {
  question: Question;
  onUpvote: (id: string) => void;
  onResolve: (id: string) => void;
  isAdmin: boolean;
}

export function QuestionItem({ question, onUpvote, onResolve, isAdmin }: QuestionItemProps) {
  const isResolved = question.resolved;
  const canResolve = question.isOwner || isAdmin;

  return (
    <div
      className={`bg-white rounded-lg shadow p-4 mb-4 border-l-4 transition-all ${
        isResolved ? "border-green-500 bg-gray-50" : "border-blue-500"
      }`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <p className={`text-lg ${isResolved ? "text-gray-600" : "text-gray-900"}`}>
            {question.content}
          </p>
          <div className="mt-2 flex items-center text-sm text-gray-500 space-x-4">
            <span>{formatDistanceToNow(new Date(question.createdAt), { addSuffix: true })}</span>
            {isResolved && (
              <span className="flex items-center text-green-600 font-medium">
                <CheckCircle className="w-4 h-4 mr-1" />
                Resolved
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end space-y-2">
          <button
            onClick={() => onUpvote(question.id)}
            className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              question.isUpvoted
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title={question.isUpvoted ? "Remove upvote" : "Upvote"}
          >
            <ThumbsUp className={`w-4 h-4 ${question.isUpvoted ? "fill-current" : ""}`} />
            <span>{question.upvotes}</span>
          </button>

          {canResolve && !isResolved && (
            <button
              onClick={() => onResolve(question.id)}
              className="text-xs text-gray-500 hover:text-green-600 flex items-center"
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Mark as resolved
            </button>
          )}
          
          {canResolve && isResolved && (
            <button
              onClick={() => onResolve(question.id)}
              className="text-xs text-gray-500 hover:text-yellow-600 flex items-center"
            >
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

