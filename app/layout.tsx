import React from "react";
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

// Notice the lowercase "footer" here to match your file exactly!
import Footer from "./components/footer";

// Premium font import
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

// --- UPDATED SEO METADATA ---
export const metadata: Metadata = {
  title: 'OkiConstruct | Construction Estimation & BOQ Software',
  description: 'The modern cloud platform for accurate construction estimation, intelligent BOQ generation, and real-time expense tracking.',
  keywords: ['OkiConstruct', 'BOQ software', 'construction estimation tool', 'expense tracking for builders', 'civil engineering software'],
  openGraph: {
    title: 'OkiConstruct',
    description: 'Smart BOQ and Construction Management',
    url: 'https://okiconstruct.com',
    siteName: 'OkiConstruct',
    images: [
      {
        url: 'https://okiconstruct.com/icon.png', // This displays your logo when sharing on WhatsApp/LinkedIn
        width: 512,
        height: 512,
      },
    ],
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.className} bg-gray-50 text-black flex flex-col min-h-screen`}>
        
        {/* Main Content Area */}
        <div className="flex-grow">
          {children}
        </div>
        
        {/* Global Footer */}
        <Footer />
        
      </body>
    </html>
  );
}