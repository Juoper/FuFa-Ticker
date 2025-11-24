import { useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/memes";
import { getUserFromRequest, createUser, createUserCookie } from "~/lib/session.server";
import { prisma } from "~/lib/db.server";
import { NamePrompt } from "~/components/NamePrompt";
import { MemeCreator } from "~/components/MemeCreator";
import { MemeCard } from "~/components/MemeCard";
import { getTemplates, createMemeFromTemplate, type TextBox } from "~/lib/imgflip.server";
import { uploadMemeImage } from "~/lib/upload.server";
import sharp from "sharp";
import { writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return { user: null, templates: [], memes: [] };
  }

  const templates = await getTemplates();

  const memes = await prisma.meme.findMany({
    include: {
      user: {
        select: {
          name: true,
        },
      },
      votes: {
        where: {
          userId: user.id,
        },
        select: {
          voteType: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const memesWithUserVote = memes.map((meme) => ({
    ...meme,
    userVote: meme.votes[0]?.voteType || null,
    votes: undefined,
  }));

  return { user, templates, memes: memesWithUserVote };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle user registration
  if (intent === "register") {
    const name = formData.get("name") as string;
    if (!name || !name.trim()) {
      return { error: "Name is required" };
    }

    const user = await createUser(name);
    const cookie = createUserCookie(user.id);

    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/memes",
      },
    });
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return { error: "Unauthorized" };
  }

  // Handle meme creation from template
  if (intent === "createFromTemplate") {
    const templateId = formData.get("templateId") as string;
    const textBoxesCount = parseInt(formData.get("textBoxesCount") as string);

    const textBoxes: TextBox[] = [];
    for (let i = 0; i < textBoxesCount; i++) {
      const text = formData.get(`text${i}`) as string;
      if (text && text.trim()) {
        textBoxes.push({ text: text.trim() });
      }
    }

    if (textBoxes.length === 0) {
      return { error: "At least one text box is required" };
    }

    const imageUrl = await createMemeFromTemplate(templateId, textBoxes);
    if (!imageUrl) {
      return { error: "Failed to create meme" };
    }

    await prisma.meme.create({
      data: {
        imageUrl,
        templateId,
        caption: JSON.stringify(textBoxes),
        userId: user.id,
      },
    });

    return { success: true };
  }

  // Handle meme creation from custom image
  if (intent === "createFromCustom") {
    const image = formData.get("image") as File;
    const addText = formData.get("addText") as string;

    if (!image) {
      return { error: "Image is required" };
    }

    // Upload the base image
    const baseImageUrl = await uploadMemeImage(image);
    if (!baseImageUrl) {
      return { error: "Failed to upload image" };
    }

    let finalImageUrl = baseImageUrl;
    const textBoxes: TextBox[] = [];

    // Only process text if user wants to add text
    if (addText === "true") {
      const textBoxesCount = parseInt(formData.get("textBoxesCount") as string);
      
      // Get text boxes
      for (let i = 0; i < textBoxesCount; i++) {
        const text = formData.get(`text${i}`) as string;
        if (text && text.trim()) {
          textBoxes.push({ text: text.trim() });
        }
      }

      // If there are text boxes, overlay them on the image
      if (textBoxes.length > 0) {
        finalImageUrl = await overlayTextOnImage(baseImageUrl, textBoxes);
        if (!finalImageUrl) {
          return { error: "Failed to add text to image" };
        }
      }
    }

    await prisma.meme.create({
      data: {
        imageUrl: finalImageUrl,
        templateId: null,
        caption: JSON.stringify(textBoxes),
        userId: user.id,
      },
    });

    return { success: true };
  }

  // Handle voting
  if (intent === "vote") {
    const memeId = formData.get("memeId") as string;
    const voteType = formData.get("voteType") as string;

    // Check if user already voted
    const existingVote = await prisma.memeVote.findUnique({
      where: {
        memeId_userId: {
          memeId,
          userId: user.id,
        },
      },
    });

    if (existingVote) {
      // If clicking the same vote, remove it
      if (existingVote.voteType === voteType) {
        await prisma.memeVote.delete({
          where: { id: existingVote.id },
        });

        // Update meme vote counts
        const field = voteType === "up" ? "upvotes" : "downvotes";
        await prisma.meme.update({
          where: { id: memeId },
          data: { [field]: { decrement: 1 } },
        });
      } else {
        // Change vote
        await prisma.memeVote.update({
          where: { id: existingVote.id },
          data: { voteType },
        });

        // Update meme vote counts
        const oldField = existingVote.voteType === "up" ? "upvotes" : "downvotes";
        const newField = voteType === "up" ? "upvotes" : "downvotes";
        await prisma.meme.update({
          where: { id: memeId },
          data: {
            [oldField]: { decrement: 1 },
            [newField]: { increment: 1 },
          },
        });
      }
    } else {
      // Create new vote
      await prisma.memeVote.create({
        data: {
          memeId,
          userId: user.id,
          voteType,
        },
      });

      // Update meme vote counts
      const field = voteType === "up" ? "upvotes" : "downvotes";
      await prisma.meme.update({
        where: { id: memeId },
        data: { [field]: { increment: 1 } },
      });
    }

    return { success: true };
  }

  // Handle meme deletion (admin only)
  if (intent === "deleteMeme") {
    if (!user.isAdmin) {
      return { error: "Forbidden" };
    }

    const memeId = formData.get("memeId") as string;
    await prisma.meme.delete({
      where: { id: memeId },
    });

    return { success: true };
  }

  return { error: "Invalid intent" };
}

async function overlayTextOnImage(
  imageUrl: string,
  textBoxes: TextBox[]
): Promise<string | null> {
  try {
    const imagePath = path.join(process.cwd(), "public", imageUrl);
    const imageBuffer = await sharp(imagePath).toBuffer();
    const metadata = await sharp(imageBuffer).metadata();

    const width = metadata.width || 800;
    const height = metadata.height || 600;

    // Create SVG overlay with text
    const svgTexts = textBoxes.map((box, index) => {
      const fontSize = Math.floor(width / 15);
      const y = index === 0 ? fontSize + 20 : height - 20;
      
      return `
        <text
          x="50%"
          y="${y}"
          font-size="${fontSize}"
          font-family="Impact, Arial Black, sans-serif"
          font-weight="900"
          text-anchor="middle"
          fill="${box.color || "#FFFFFF"}"
          stroke="${box.outline_color || "#000000"}"
          stroke-width="${fontSize / 20}"
          style="text-transform: uppercase;"
        >
          ${escapeXml(box.text)}
        </text>
      `;
    }).join("");

    const svg = `
      <svg width="${width}" height="${height}">
        ${svgTexts}
      </svg>
    `;

    // Overlay text on image
    const result = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(svg),
          top: 0,
          left: 0,
        },
      ])
      .toBuffer();

    // Save result
    const filename = `${randomBytes(16).toString("hex")}.png`;
    const outputPath = path.join(process.cwd(), "public/uploads/memes", filename);
    await writeFile(outputPath, result);

    return `/uploads/memes/${filename}`;
  } catch (error) {
    console.error("Error overlaying text on image:", error);
    return null;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

export default function Memes() {
  const { user, templates, memes } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  if (!user) {
    return (
      <>
        <NamePrompt />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-500">Loading...</p>
        </div>
      </>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Memes</h1>

      <MemeCreator templates={templates} />

      <div className="mb-4">
        <h2 className="text-2xl font-bold">Gallery</h2>
        <p className="text-gray-600">
          {memes.length} {memes.length === 1 ? "meme" : "memes"}
        </p>
      </div>

      {memes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No memes yet. Be the first to create one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {memes.map((meme) => (
            <MemeCard key={meme.id} meme={meme} isAdmin={user.isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

