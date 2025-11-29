import { Link } from "react-router";
import { useState, useEffect } from "react";

interface NavigationProps {
  userName?: string;
  userPin?: string;
  isAdmin?: boolean;
}

export function Navigation({ userName, userPin, isAdmin }: NavigationProps) {
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (showPin) {
      const timer = setTimeout(() => {
        setShowPin(false);
      }, 5000); // Hide after 5 seconds

      return () => clearTimeout(timer);
    }
  }, [showPin]);

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-blue-600">
              FuFa
            </Link>
            <div className="flex space-x-4">
              <Link
                to="/feed"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Feed
              </Link>
              <Link
                to="/memes"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Memes
              </Link>
              <Link
                to="/games"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Games
              </Link>
              <Link
                to="/qa"
                className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Q&A
              </Link>
            </div>
          </div>
          {userName && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-700 text-sm">{userName}</span>
              {userPin && (
                <>
                  <span className="text-gray-500 text-xs">View PIN</span>
                  <button
                    onClick={() => setShowPin(!showPin)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition"
                    title="Click to show your PIN for 5 seconds"
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="w-5 h-5 text-gray-600"
                    >
                      {showPin ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                        />
                      )}
                      {!showPin && (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      )}
                    </svg>
                  </button>
                </>
              )}
              {showPin && userPin && (
                <span className="text-sm font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  PIN: {userPin}
                </span>
              )}
              {isAdmin && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                  Admin
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
