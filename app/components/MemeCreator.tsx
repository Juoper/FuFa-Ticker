import React, { useState, useEffect, useCallback } from "react";
import { Form } from "react-router";
import type { ImgflipTemplate } from "~/lib/imgflip.server";

interface MemeCreatorProps {
  templates: ImgflipTemplate[];
}

export function MemeCreator({ templates = [] }: MemeCreatorProps) {
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<ImgflipTemplate | null>(null);
  const [textBoxes, setTextBoxes] = useState<string[]>(["", ""]);
  const [customImage, setCustomImage] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [addTextToCustom, setAddTextToCustom] = useState(false);

  const handleTemplateSelect = (template: ImgflipTemplate) => {
    setSelectedTemplate(template);
    setTextBoxes(Array(template.box_count).fill(""));
    setPreviewUrl(template.url); // Show original template initially
  };

  const generatePreview = useCallback(async () => {
    if (!selectedTemplate) return;

    setIsGeneratingPreview(true);
    try {
      const response = await fetch('/api/preview-meme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          textBoxes: textBoxes,
        }),
      });

      const data = await response.json();
      if (data.url) {
        setPreviewUrl(data.url);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [selectedTemplate, textBoxes]);

  // Debounced preview generation
  useEffect(() => {
    if (!selectedTemplate) return;
    
    // Only generate preview if at least one text box has content
    const hasText = textBoxes.some(text => text.trim());
    if (!hasText) {
      setPreviewUrl(selectedTemplate.url);
      return;
    }

    const timeoutId = setTimeout(() => {
      generatePreview();
    }, 800); // Wait 800ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [textBoxes, selectedTemplate, generatePreview]);

  const handleCustomImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomImage(file);
      const reader = new FileReader();
      reader.onload = () => {
        setCustomImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setTextBoxes(["", ""]); // Default to 2 text boxes for custom images
    }
  };

  const updateTextBox = (index: number, value: string) => {
    const newBoxes = [...textBoxes];
    newBoxes[index] = value;
    setTextBoxes(newBoxes);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4">Create a Meme</h2>

      {/* Mode Selector */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setMode("template")}
          className={`px-4 py-2 rounded-lg transition ${
            mode === "template"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Use Template
        </button>
        <button
          onClick={() => setMode("custom")}
          className={`px-4 py-2 rounded-lg transition ${
            mode === "custom"
              ? "bg-blue-500 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Upload Custom
        </button>
      </div>

      {/* Template Mode */}
      {mode === "template" && !selectedTemplate && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Select a Template</h3>
          {templates.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Loading templates or unable to fetch from Imgflip API...
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
              {templates.slice(0, 50).map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template)}
                className="border border-gray-300 rounded-lg p-2 hover:border-blue-500 hover:shadow-md transition"
              >
                <img
                  src={template.url}
                  alt={template.name}
                  className="w-full h-32 object-cover rounded mb-2"
                />
                <p className="text-xs text-gray-700 truncate">{template.name}</p>
              </button>
            ))}
            </div>
          )}
        </div>
      )}

      {/* Template Editor */}
      {mode === "template" && selectedTemplate && (
        <div>
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-blue-500 hover:text-blue-700 mb-4 text-sm"
          >
            ← Back to templates
          </button>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="relative" style={{ maxHeight: "500px", overflow: "hidden" }}>
                <img
                  src={previewUrl || selectedTemplate.url}
                  alt={selectedTemplate.name}
                  className="w-full rounded-lg object-contain"
                  style={{ maxHeight: "500px" }}
                />
                {isGeneratingPreview && (
                  <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center">
                    <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-sm">
                      Generating preview...
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <Form method="post" encType="multipart/form-data">
                <input type="hidden" name="intent" value="createFromTemplate" />
                <input type="hidden" name="templateId" value={selectedTemplate.id} />
                <input type="hidden" name="textBoxesCount" value={textBoxes.length} />
                
                <h3 className="text-lg font-semibold mb-3">{selectedTemplate.name}</h3>
                {textBoxes.map((text, index) => (
                  <div key={index} className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Text Box {index + 1}
                    </label>
                    <input
                      type="text"
                      name={`text${index}`}
                      value={text}
                      onChange={(e) => updateTextBox(index, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={index === 0 ? "Top text" : index === textBoxes.length - 1 ? "Bottom text" : `Text ${index + 1}`}
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition disabled:bg-gray-300"
                  disabled={textBoxes.every(t => !t.trim())}
                >
                  Create Meme
                </button>
              </Form>
            </div>
          </div>
        </div>
      )}

      {/* Custom Upload Mode */}
      {mode === "custom" && (
        <div>
          <Form method="post" encType="multipart/form-data">
            <input type="hidden" name="intent" value="createFromCustom" />
            <input type="hidden" name="addText" value={addTextToCustom ? "true" : "false"} />
            <input type="hidden" name="textBoxesCount" value={textBoxes.length} />
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Image
              </label>
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleCustomImageChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {customImagePreview && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="addText"
                    checked={addTextToCustom}
                    onChange={(e) => setAddTextToCustom(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="addText" className="text-sm font-medium text-gray-700">
                    Add text to image
                  </label>
                </div>

                {addTextToCustom ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div style={{ maxHeight: "500px", overflow: "hidden" }}>
                      <img
                        src={customImagePreview}
                        alt="Preview"
                        className="w-full rounded-lg object-contain"
                        style={{ maxHeight: "500px" }}
                      />
                    </div>
                    <div>
                      {textBoxes.map((text, index) => (
                        <div key={index} className="mb-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Text Box {index + 1}
                          </label>
                          <input
                            type="text"
                            name={`text${index}`}
                            value={text}
                            onChange={(e) => updateTextBox(index, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={index === 0 ? "Top text" : "Bottom text"}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center" style={{ maxHeight: "500px", overflow: "hidden" }}>
                    <img
                      src={customImagePreview}
                      alt="Preview"
                      className="rounded-lg object-contain"
                      style={{ maxHeight: "500px", maxWidth: "100%" }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition"
                >
                  Upload {addTextToCustom ? "Meme" : "Image"}
                </button>
              </div>
            )}
          </Form>
        </div>
      )}
    </div>
  );
}

