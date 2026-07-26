import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sergeyrudik-bortnik-vk-game-c295.twc1.net"),
  title: "Бортник — золотые соты",
  description: "Собирай нектар в сотах, вари мёд и отгоняй ос, пока улей не полон.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    title: "Бортник — золотые соты",
    description: "Собирай нектар в сотах, вари мёд и отгоняй ос, пока улей не полон.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Бортник — золотые соты" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Бортник — золотые соты",
    description: "Собирай нектар в сотах, вари мёд и отгоняй ос, пока улей не полон.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
