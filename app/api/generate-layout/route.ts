import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

export async function POST(req: Request) {
  try {
    // 1. We receive the pre-compiled prompt string from your page.tsx frontend
    // This already contains the text "Main Hall (14x14), Kitchen..."
    const { prompt } = await req.json();

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const location = process.env.GOOGLE_CLOUD_LOCATION;

    if (!projectId || !location || !accessToken.token) {
      return NextResponse.json({ error: 'Google Cloud configuration missing.' }, { status: 500 });
    }

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;

    // 2. We combine your strict architectural rules with the frontend data
    const fullPrompt = `A highly precise, professional 2D CAD floor plan blueprint. Top-down orthographic view of the following layout: ${prompt}. 
CRITICAL RULES: 
1. Draw EXACTLY TWO bedrooms. 
2. The Master Bedroom must have one attached bathroom accessible only from inside the Master Bedroom. 
3. Draw one common bathroom accessible only from the main passage. 
4. Include a Main Hall, Kitchen, Passage, and Foyer. 
5. Visual style: crisp black lines on a white background, standard architectural symbols.
6. Attempt to clearly label each room with its name and dimensions based on the provided layout sizes.`;

    // 3. Make the secure request to Google
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: fullPrompt
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "4:3",
          safetySetting: "BLOCK_ONLY_HIGH", 
          personGeneration: "DONT_ALLOW",
          guidanceScale: 25,
          additionalConfig: {
             "style": "technical drawing"
          }
        }
      })
    });

    const data = await response.json();

    // 4. Extract the base64 image string and send it to your Next.js frontend
    if (data.predictions && data.predictions.length > 0) {
      const base64Image = data.predictions[0].bytesBase64Encoded;
      return NextResponse.json({ 
        success: true, 
        imageUrl: `data:image/png;base64,${base64Image}` 
      });
    } else {
      console.error("Google API Error:", data);
      return NextResponse.json({ 
        success: false, 
        error: data.error?.message || 'The Agent platform failed to generate the image.' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json({ success: false, error: 'Failed to connect to Google Cloud.' }, { status: 500 });
  }
}