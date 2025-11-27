import { prisma } from "./db.server";

export async function createQuestion(userId: string, content: string) {
  const question = await prisma.question.create({
    data: {
      content,
      userId,
    },
    include: {
      _count: {
        select: { upvotes: true },
      },
    },
  });

  // Return formatted question
  return {
    ...question,
    upvotes: question._count.upvotes,
    isUpvoted: false,
    isOwner: true, // Creator is always the owner
    userId: question.userId, // Keep this for server-side logic
    _count: undefined,
  };
}

export async function getQuestions(currentUserId?: string) {
  const questions = await prisma.question.findMany({
    orderBy: [
      { resolved: "asc" }, // Unresolved first
      { upvotes: { _count: "desc" } }, // Most upvoted first
      { createdAt: "desc" }, // Newest first
    ],
    include: {
      _count: {
        select: { upvotes: true },
      },
      upvotes: {
        where: currentUserId ? { userId: currentUserId } : undefined,
        select: { userId: true },
      },
    },
  });

  return questions.map((q) => ({
    ...q,
    upvotes: q._count.upvotes,
    isUpvoted: q.upvotes.length > 0,
    isOwner: currentUserId === q.userId,
    // Remove sensitive/internal data
    userId: undefined, 
    _count: undefined,
  }));
}

export async function upvoteQuestion(userId: string, questionId: string) {
  const existingUpvote = await prisma.questionUpvote.findUnique({
    where: {
      questionId_userId: {
        questionId,
        userId,
      },
    },
  });

  if (existingUpvote) {
    // Remove upvote
    await prisma.questionUpvote.delete({
      where: { id: existingUpvote.id },
    });
  } else {
    // Add upvote
    await prisma.questionUpvote.create({
      data: {
        questionId,
        userId,
      },
    });
  }

  return getQuestion(questionId, userId);
}

export async function resolveQuestion(userId: string, questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) throw new Error("Question not found");

  // Check permissions: Only owner or admin can resolve
  // We need to check if user is admin.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (question.userId !== userId && !user?.isAdmin) {
    throw new Error("Unauthorized");
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { resolved: !question.resolved },
    include: {
      _count: {
        select: { upvotes: true },
      },
      upvotes: {
        where: { userId },
        select: { userId: true },
      },
    },
  });
  
  return {
    ...updated,
    upvotes: updated._count.upvotes,
    isUpvoted: updated.upvotes.length > 0,
    isOwner: updated.userId === userId,
    userId: undefined,
    _count: undefined
  };
}

// Helper to get a single question formatted consistently
async function getQuestion(questionId: string, currentUserId: string) {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      _count: {
        select: { upvotes: true },
      },
      upvotes: {
        where: { userId: currentUserId },
        select: { userId: true },
      },
    },
  });

  if (!q) return null;

  return {
    ...q,
    upvotes: q._count.upvotes,
    isUpvoted: q.upvotes.length > 0,
    isOwner: currentUserId === q.userId,
    userId: undefined,
    _count: undefined,
  };
}

