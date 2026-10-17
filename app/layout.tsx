import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Research Application Tracker", description: "Track research outreach applications by term." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" /><link rel="stylesheet" href="/styles.css" /></head><body>{children}</body></html>;
}
