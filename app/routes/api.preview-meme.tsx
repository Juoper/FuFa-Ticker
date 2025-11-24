import type { Route } from "./+types/api.preview-meme";
import { createMemeFromTemplate, type TextBox } from "~/lib/imgflip.server";

export async function action({ request }: Route.ActionArgs) {
  try {
    const body = await request.json();
    const { templateId, textBoxes } = body;

    if (!templateId || !Array.isArray(textBoxes)) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    // Filter out empty text boxes and create TextBox objects
    const validTextBoxes: TextBox[] = textBoxes
      .filter((text: string) => text && text.trim())
      .map((text: string) => ({ text: text.trim() }));

    if (validTextBoxes.length === 0) {
      return Response.json({ error: "At least one text box is required" }, { status: 400 });
    }

    // Generate meme using Imgflip API
    const imageUrl = await createMemeFromTemplate(templateId, validTextBoxes);

    if (!imageUrl) {
      return Response.json({ error: "Failed to generate preview" }, { status: 500 });
    }

    return Response.json({ url: imageUrl });
  } catch (error) {
    console.error("Preview generation error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

