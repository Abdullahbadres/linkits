import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blu-ray Digital Copy Sales",
  description:
    "LINKIT: Blu-ray releases with digital copy codes. Track digital copy sales and fulfillment—JWT auth, APIs, and SQLite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
