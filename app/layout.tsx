import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TempMail - Free Disposable Email",
  description: "Generate temporary email addresses instantly. Free, secure, and anonymous disposable emails to protect your privacy.",
  keywords: "temp mail, temporary email, disposable email, anonymous email, free email",
  openGraph: {
    title: "TempMail - Free Disposable Email",
    description: "Generate temporary email addresses instantly. Protect your privacy.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
