import './globals.css';

export const metadata = {
  title: 'OkiConstruct',
  description: 'Construction Management Software',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-black">
        {children}
      </body>
    </html>
  )
}