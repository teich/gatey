import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gatey — Bennett Valley Gate",
    short_name: "Gatey",
    description: "Open Bennett Valley Gate and manage household access.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#173f32",
    icons: [
      { src: "/gatey-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/gatey-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
