import { useState } from "react";
import { Form, useActionData } from "react-router";

interface ActionData {
  step?: "login" | "signup";
  userName?: string;
  generatedPin?: string;
  error?: string;
}

export function NamePrompt() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const actionData = useActionData<ActionData>();

  // Step 1: Enter name
  if (!actionData?.step) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Welcome!</h2>
          <p className="text-gray-600 mb-4">
            Please enter your name to get started:
          </p>
          {actionData?.error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {actionData.error}
            </div>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="check-name" />
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-gray-900 bg-white placeholder:text-gray-500"
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

  // Step 2a: Login (existing user)
  if (actionData.step === "login") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Welcome back, {actionData.userName}!</h2>
          <p className="text-gray-600 mb-4">
            Please enter your PIN to continue:
          </p>
          {actionData?.error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
              {actionData.error}
            </div>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="login" />
            <input type="hidden" name="name" value={actionData.userName} />
            <input
              type="text"
              name="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="Enter your 2-digit PIN"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-center text-2xl tracking-widest text-gray-900 bg-white placeholder:text-gray-500"
              maxLength={2}
              pattern="\d{2}"
              required
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pin.length !== 2}
                className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                Login
              </button>
            </div>
          </Form>
        </div>
      </div>
    );
  }

  // Step 2b: Signup (new user)
  if (actionData.step === "signup") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Welcome, {actionData.userName}!</h2>
          <p className="text-gray-600 mb-4">
            Your account has been created. Here is your PIN:
          </p>
          <div className="bg-blue-50 border-2 border-blue-500 rounded-lg p-6 mb-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Your PIN is:</p>
              <p className="text-5xl font-bold text-blue-600 tracking-widest">
                {actionData.generatedPin}
              </p>
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Important:</strong> Save this PIN! You'll need it to login on other devices.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="complete-signup" />
            <input type="hidden" name="name" value={actionData.userName} />
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition"
            >
              Continue
            </button>
          </Form>
        </div>
      </div>
    );
  }

  return null;
}
