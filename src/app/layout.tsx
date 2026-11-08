import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DreamStation | Art Display Management",
  description: "Local Art Display Management for your DreamStation frame.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#020617] text-zinc-100 selection:bg-blue-500/30 selection:text-blue-200`}
      >
        {/* Hidden SVG filter defs — ice-glass distortion via backdrop-filter: url(#glass-ice-distort) */}
        <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
          <defs>
            {/*
              Ice-glass refraction filter.
              fractalNoise = smooth organic waves (vs turbulence = harsh jagged)
              baseFrequency: lower = larger waves (more obvious on dark bg)
              scale: displacement in px — 28 gives visible warp without losing readability
            */}
            <filter id="glass-ice-distort" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="4" seed="42" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="28" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            </filter>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
