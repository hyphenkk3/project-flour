import type { Metadata } from "next";
import { Outfit, Newsreader } from "next/font/google";
import "@/app/globals.css";

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Whitebird",
    template: "%s · Whitebird",
  },
  description:
    "Whitebird Cake House — celebrations, cakes, and the Whitebird order experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
