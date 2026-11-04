import type { MetadataRoute } from "next";

// Makes Artha installable ("Add to Home Screen" / "Install app").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Artha — Know your money. Own your future.",
    short_name: "Artha",
    description: "Track every rupee: spending, budgets, subscriptions, lending and savings.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f8f7",
    theme_color: "#0f766e",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Subscription Radar", url: "/plan?tab=bills", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Activity", url: "/transactions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
