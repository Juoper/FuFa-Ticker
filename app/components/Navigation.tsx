import { Link } from "react-router";

interface NavigationProps {
  userName?: string;
  isAdmin?: boolean;
}

export function Navigation({ userName, isAdmin }: NavigationProps) {
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
                to="/"
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
            </div>
          </div>
          {userName && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-700 text-sm">{userName}</span>
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

