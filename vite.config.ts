import { supernovaDesignPlugin } from "@supernovaio/prototyping-tooling/build";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";

export default defineConfig({
  base: "/",
  plugins: [
    supernovaDesignPlugin(),
    errorMonitorPlugin(),
    react(),
    tailwindcss(),
    createServeGeneratedCssPlugin(),
  ],
  server: {
    port: 3000,
    allowedHosts: true,
  },
  publicDir: "public",
  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2018",
    },
  },
  esbuild: {
    target: "es2018",
  },
  build: {
    minify: "esbuild",
    target: "es2018",
    cssTarget: ["chrome87", "edge88", "firefox78", "safari13"],
    rollupOptions: {
      output: {
        manualChunks: {
          "solana-web3": ["@solana/web3.js"],
          "radix-ui": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],
          "charts-motion": ["recharts", "framer-motion"],
        },
      },
    },
  },
});

type BuildError = {
  message: string;
  stack?: string;
  id?: string;
  plugin?: string;
  loc?: any;
  frame?: string;
  timestamp: number;
};

export function errorMonitorPlugin(): any {
  let currentErrors: BuildError[] = [];
  let lastUpdate = Date.now();

  return {
    name: "error-monitor",
    configureServer(server: any) {
      server.middlewares.use("/__healthcheck", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");

        const hasErrors = currentErrors.length > 0;

        res.end(
          JSON.stringify(
            {
              status: hasErrors ? "failed" : "success",
              errors: currentErrors,
              errorCount: currentErrors.length,
              lastUpdate,
              timestamp: Date.now(),
            },
            null,
            2
          )
        );
      });

      const originalSend = server.ws.send;
      server.ws.send = function (payload: any) {
        if (payload && typeof payload === "object" && payload.type === "error") {
          const error = {
            message: payload.err?.message || "Unknown error",
            stack: payload.err?.stack,
            id: payload.err?.id,
            plugin: payload.err?.plugin,
            loc: payload.err?.loc,
            frame: payload.err?.frame,
            timestamp: Date.now(),
          };

          const existingIndex = currentErrors.findIndex((entry) => entry.id === error.id);
          if (existingIndex >= 0) {
            currentErrors[existingIndex] = error;
          } else {
            currentErrors.push(error);
          }
          lastUpdate = Date.now();
        }

        if (payload && typeof payload === "object" && payload.type === "update") {
          currentErrors = [];
          lastUpdate = Date.now();
        }

        return originalSend.call(this, payload);
      };
    },

    async transform(_code: any, id: any) {
      try {
        return null;
      } catch (err: any) {
        const error = {
          message: err.message,
          stack: err.stack,
          id,
          timestamp: Date.now(),
          type: "transform",
        };

        currentErrors.push(error);
        lastUpdate = Date.now();
        throw err;
      }
    },

    buildStart() {
      currentErrors = [];
      lastUpdate = Date.now();
    },
  };
}

function createServeGeneratedCssPlugin(): Plugin {
  return {
    name: "serve-generated-css",
    configureServer(server) {
      server.middlewares.use(createGeneratedCssMiddleware());
    },
    generateBundle(this) {
      const generatedDir = resolve(__dirname, "src/generated");
      try {
        const files = readdirSync(generatedDir);
        files.forEach((file) => {
          if (file.endsWith(".css")) {
            try {
              const content = readFileSync(resolve(generatedDir, file), "utf-8");
              this.emitFile({
                type: "asset",
                fileName: `generated/${file}`,
                source: content,
              });
            } catch (err) {
              console.warn(`Could not copy ${file}:`, err);
            }
          }
        });
      } catch (err) {
        console.warn("Could not read generated directory:", err);
      }
    },
  };
}

function createGeneratedCssMiddleware() {
  return (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/generated/") || !url.endsWith(".css")) {
      return next();
    }

    const fileName = url.slice("/generated/".length);
    const cssPath = resolve(__dirname, `src/generated/${fileName}`);

    try {
      const cssContent = readFileSync(cssPath, "utf-8");
      res.setHeader("Content-Type", "text/css");
      res.end(cssContent);
    } catch (err) {
      console.warn(`Could not read ${fileName}:`, err);
      next();
    }
  };
}
