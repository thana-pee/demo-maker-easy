import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-ibm-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#5B61EE",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Demo Maker Easy — Acoustic Songwriting Studio & Karaoke Teleprompter",
  description: "เว็บแอปพลิเคชันสำหรับนักแต่งเพลงและทำเดโม่เพลงอะคูสติก 3D พร้อมโหมดคาราโอเกะสำหรับ iPad และแท็บเล็ต",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Demo Maker",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      data-theme="light"
      className={`${ibmPlexSansThai.variable} ${ibmPlexMono.variable} light`}
    >
      <body className="bg-canvas text-ink-900 min-h-screen antialiased selection:bg-accent-200">
        <ThemeProvider>
          <LanguageProvider>
            <ServiceWorkerRegister />
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
