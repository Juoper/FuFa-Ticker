import { useState } from "react";
import { Form } from "react-router";

export function NamePrompt() {
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Welcome!</h2>
        <p className="text-gray-600 mb-4">
          Please enter your name to get started:
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="register" />
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            required
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            Continue
          </button>
        </Form>
      </div>
    </div>
  );
}

