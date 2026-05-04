import { Space_Grotesk } from 'next/font/google';
import "./globals.css";

// This imports the premium font automatically, no downloads required!
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] });

export const metadata = {
  title: "OkiConstruct | Command Center",
  description: "The Professional Construction Management Suite.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/* This injects the new font into every single page of your app */}
      <body className={`${spaceGrotesk.className} bg-gray-50 text-black`}>
        {children}
      </body>
    </html>
  );
}