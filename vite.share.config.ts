import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

function umamiPlugin(): Plugin {
  const websiteId = process.env.VITE_UMAMI_WEBSITE_ID;
  return {
    name: "umami",
    transformIndexHtml(html) {
      if (!websiteId) return html;
      return html.replace(
        "</head>",
        `  <script defer src="https://cloud.umami.is/script.js" data-website-id="${websiteId}" data-auto-track="false"></script>
  <script>document.addEventListener('DOMContentLoaded',()=>{if(window.umami)umami.track(props=>({...props,url:location.pathname}))})</script>
  </head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), umamiPlugin()],
  root: "src/share",
  publicDir: "../../public",
  base: "/share/",
  build: {
    outDir: "../../docs/share",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
});
