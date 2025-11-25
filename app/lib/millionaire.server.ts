import questionsData from "./millionaire-questions.json";

export const PRIZE_LADDER = [
  50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000,
  125000, 500000, 1000000,
];

export const SAFETY_NETS = [5, 10]; // Indices in PRIZE_LADDER (€1,000 and €32,000)

export type Lifeline = "50:50" | "phone" | "audience";

export interface Question {
  question: string;
  answers: string[]; // 4 answers
  correctAnswer: string;
  level: number; // 1-15
}

export interface MillionaireState {
  currentLevel: number; // 0-14 (index in PRIZE_LADDER)
  currentQuestion: Question | null;
  usedLifelines: Lifeline[];
  lifelineResults: {
    type: Lifeline | null;
    data: any;
  } | null;
  playerAnswers: {
    [userId: string]: {
      answer: string | null;
      isCorrect: boolean | null;
      isEliminated: boolean;
      currentLevel: number;
      prizeWon: number;
    };
  };
  status: "waiting" | "in_progress" | "completed";
  winnerId: string | null;
}

// Helper to get random question for a specific difficulty level
export function getRandomQuestion(level: number): Question | null {
  const levelKey = level.toString();
  const questions = questionsData[levelKey as keyof typeof questionsData];

  if (!questions || questions.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * questions.length);
  const questionData = questions[randomIndex];

  if (!questionData || questionData.length < 6) {
    return null;
  }

  return {
    question: questionData[0],
    answers: [questionData[1], questionData[2], questionData[3], questionData[4]],
    correctAnswer: questionData[5],
    level,
  };
}

// Initialize game state
export function initializeMillionaireGame(playerIds: string[]): MillionaireState {
  const playerAnswers: MillionaireState["playerAnswers"] = {};

  playerIds.forEach((userId) => {
    playerAnswers[userId] = {
      answer: null,
      isCorrect: null,
      isEliminated: false,
      currentLevel: 0,
      prizeWon: 0,
    };
  });

  const firstQuestion = getRandomQuestion(1);

  return {
    currentLevel: 0,
    currentQuestion: firstQuestion,
    usedLifelines: [],
    lifelineResults: null,
    playerAnswers,
    status: "in_progress",
    winnerId: null,
  };
}

// Apply 50:50 lifeline - removes 2 wrong answers
export function apply5050Lifeline(question: Question): string[] {
  const wrongAnswers = question.answers.filter((a) => a !== question.correctAnswer);
  
  // Randomly select 2 wrong answers to remove
  const shuffled = wrongAnswers.sort(() => Math.random() - 0.5);
  const toRemove = shuffled.slice(0, 2);

  return toRemove;
}

// Apply Phone-a-Friend lifeline - 80% chance friend gives correct answer
export function applyPhoneLifeline(question: Question): {
  answer: string;
  confidence: string;
} {
  const isCorrect = Math.random() < 0.8;
  const answer = isCorrect
    ? question.correctAnswer
    : question.answers.find((a) => a !== question.correctAnswer) ||
      question.answers[0];

  const confidenceLevels = [
    "ziemlich sicher",
    "ich glaube",
    "ich denke",
    "vielleicht",
  ];
  const confidence = confidenceLevels[Math.floor(Math.random() * confidenceLevels.length)];

  return { answer, confidence };
}

// Apply Ask the Audience lifeline - generates vote distribution
export function applyAudienceLifeline(question: Question): {
  [answer: string]: number;
} {
  const votes: { [answer: string]: number } = {};

  // Correct answer gets 50-80% of votes
  const correctVotes = 50 + Math.floor(Math.random() * 31);
  votes[question.correctAnswer] = correctVotes;

  // Distribute remaining votes among wrong answers
  let remainingVotes = 100 - correctVotes;
  const wrongAnswers = question.answers.filter((a) => a !== question.correctAnswer);

  wrongAnswers.forEach((answer, index) => {
    if (index === wrongAnswers.length - 1) {
      votes[answer] = remainingVotes;
    } else {
      const vote = Math.floor(Math.random() * (remainingVotes + 1));
      votes[answer] = vote;
      remainingVotes -= vote;
    }
  });

  return votes;
}

// Check answer and update game state
export function processAnswer(
  state: MillionaireState,
  userId: string,
  answer: string
): {
  isCorrect: boolean;
  newState: MillionaireState;
  prizeWon: number;
} {
  if (!state.currentQuestion) {
    return { isCorrect: false, newState: state, prizeWon: 0 };
  }

  const isCorrect = answer === state.currentQuestion.correctAnswer;
  const playerData = state.playerAnswers[userId];

  if (!playerData) {
    return { isCorrect: false, newState: state, prizeWon: 0 };
  }

  let prizeWon = 0;

  if (isCorrect) {
    // Correct answer - advance to next level
    const newLevel = state.currentLevel + 1;
    prizeWon = PRIZE_LADDER[state.currentLevel];

    playerData.currentLevel = newLevel;
    playerData.prizeWon = prizeWon;
    playerData.isCorrect = true;
    playerData.answer = answer;

    // Check if player won the million or if there are more questions
    if (newLevel >= PRIZE_LADDER.length) {
      // Won the million!
      state.status = "completed";
      state.winnerId = userId;
    } else {
      // Move to next question
      const nextQuestion = getRandomQuestion(newLevel + 1);
      state.currentLevel = newLevel;
      state.currentQuestion = nextQuestion;
      state.lifelineResults = null; // Clear lifeline results for new question
      
      // Reset answer state for next question
      playerData.answer = null;
      playerData.isCorrect = null;
    }
  } else {
    // Wrong answer - player is eliminated
    playerData.isEliminated = true;
    playerData.isCorrect = false;
    playerData.answer = answer;

    // Calculate prize based on safety nets
    const lastSafetyNet = SAFETY_NETS.filter(
      (net) => net <= state.currentLevel
    ).pop();
    prizeWon = lastSafetyNet ? PRIZE_LADDER[lastSafetyNet] : 0;
    playerData.prizeWon = prizeWon;

    // Check if all players are eliminated
    const allEliminated = Object.values(state.playerAnswers).every(
      (p) => p.isEliminated
    );
    if (allEliminated) {
      state.status = "completed";
    }
  }

  return { isCorrect, newState: state, prizeWon };
}

// Player walks away with current winnings
export function walkAway(
  state: MillionaireState,
  userId: string
): {
  newState: MillionaireState;
  prizeWon: number;
} {
  const playerData = state.playerAnswers[userId];

  if (!playerData) {
    return { newState: state, prizeWon: 0 };
  }

  // Prize is from the last completed level
  const prizeWon = state.currentLevel > 0 ? PRIZE_LADDER[state.currentLevel - 1] : 0;
  
  playerData.isEliminated = true;
  playerData.prizeWon = prizeWon;

  // Check if all players are eliminated
  const allEliminated = Object.values(state.playerAnswers).every(
    (p) => p.isEliminated
  );
  if (allEliminated) {
    state.status = "completed";
  }

  return { newState: state, prizeWon };
}

// Use a lifeline
export function useLifeline(
  state: MillionaireState,
  lifeline: Lifeline
): MillionaireState {
  if (state.usedLifelines.includes(lifeline) || !state.currentQuestion) {
    return state;
  }

  state.usedLifelines.push(lifeline);

  let lifelineData: any = null;

  switch (lifeline) {
    case "50:50":
      lifelineData = apply5050Lifeline(state.currentQuestion);
      break;
    case "phone":
      lifelineData = applyPhoneLifeline(state.currentQuestion);
      break;
    case "audience":
      lifelineData = applyAudienceLifeline(state.currentQuestion);
      break;
  }

  state.lifelineResults = {
    type: lifeline,
    data: lifelineData,
  };

  return state;
}

// Format prize amount with Euro symbol
export function formatPrize(amount: number): string {
  return `€${amount.toLocaleString("de-DE")}`;
}

// Update game statistics
export async function updateGameStats(
  userId: string,
  gameType: string,
  result: "win" | "loss" | "draw"
): Promise<void> {
  const { prisma: db } = await import("./db.server");

  const stats = await db.gameStats.findUnique({
    where: {
      userId_gameType: {
        userId,
        gameType,
      },
    },
  });

  if (stats) {
    await db.gameStats.update({
      where: {
        userId_gameType: {
          userId,
          gameType,
        },
      },
      data: {
        wins: result === "win" ? { increment: 1 } : undefined,
        losses: result === "loss" ? { increment: 1 } : undefined,
        draws: result === "draw" ? { increment: 1 } : undefined,
        totalGames: { increment: 1 },
      },
    });
  } else {
    await db.gameStats.create({
      data: {
        userId,
        gameType,
        wins: result === "win" ? 1 : 0,
        losses: result === "loss" ? 1 : 0,
        draws: result === "draw" ? 1 : 0,
        totalGames: 1,
      },
    });
  }
}

