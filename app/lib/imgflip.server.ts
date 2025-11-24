const IMGFLIP_API_BASE = "https://api.imgflip.com";

export interface ImgflipTemplate {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
}

export interface ImgflipTemplatesResponse {
  success: boolean;
  data: {
    memes: ImgflipTemplate[];
  };
}

export interface TextBox {
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  outline_color?: string;
}

export async function getTemplates(): Promise<ImgflipTemplate[]> {
  try {
    const response = await fetch(`${IMGFLIP_API_BASE}/get_memes`);
    const data: ImgflipTemplatesResponse = await response.json();

    if (data.success) {
      return data.data.memes;
    }

    throw new Error("Failed to fetch meme templates");
  } catch (error) {
    console.error("Error fetching Imgflip templates:", error);
    return [];
  }
}

export async function createMemeFromTemplate(
  templateId: string,
  textBoxes: TextBox[]
): Promise<string | null> {
  const username = process.env.IMGFLIP_USERNAME;
  const password = process.env.IMGFLIP_PASSWORD;

  if (!username || !password) {
    console.error("Imgflip credentials not configured");
    return null;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("template_id", templateId);
    formData.append("username", username);
    formData.append("password", password);

    // Add text boxes
    textBoxes.forEach((box, index) => {
      formData.append(`boxes[${index}][text]`, box.text);
      if (box.x !== undefined) formData.append(`boxes[${index}][x]`, box.x.toString());
      if (box.y !== undefined) formData.append(`boxes[${index}][y]`, box.y.toString());
      if (box.width !== undefined) formData.append(`boxes[${index}][width]`, box.width.toString());
      if (box.height !== undefined) formData.append(`boxes[${index}][height]`, box.height.toString());
      if (box.color) formData.append(`boxes[${index}][color]`, box.color);
      if (box.outline_color) formData.append(`boxes[${index}][outline_color]`, box.outline_color);
    });

    const response = await fetch(`${IMGFLIP_API_BASE}/caption_image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (data.success) {
      return data.data.url;
    }

    console.error("Imgflip API error:", data.error_message);
    return null;
  } catch (error) {
    console.error("Error creating meme:", error);
    return null;
  }
}

