import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mentor Sessions - 1-on-1 Collaboration Platform",
  description: "Real-time mentorship platform with video calls, code editing, and chat",
  keywords: ["mentorship", "collaboration", "code-editor", "video-call"],
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body
        className={`${inter.variable} ${robotoMono.variable} bg-dark-950 text-gray-100 antialiased`}
      >
        <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950">
          {children}
        </div>
      </body>
    </html>
  );
}
