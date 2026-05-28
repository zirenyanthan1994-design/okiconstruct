import { MetadataRoute } from 'next'

// THIS IS THE FIX: Forces Next.js to build this statically
export const dynamic = 'force-static';
 
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://okiconstruct.com',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
    {
      url: 'https://okiconstruct.com/upgrade',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    // Add other public pages here...
  ]
}