import React from "react";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

// Notice the lowercase "footer" here to match your file exactly!
import Footer from "./components/footer";

// Premium font import
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata = {
  title: "OkiConstruct | Log In/Sign Up",
  description: "The Professional Construction Management Suite.",
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