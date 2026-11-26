import {defineConfig} from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: resolve(import.meta.dirname, "app/html"),
    publicDir: resolve(import.meta.dirname, "public"),
    envDir: import.meta.dirname,
    resolve: {
        alias: {
            "/src": resolve(import.meta.dirname, "src")
        },
    },
    build: {
        outDir: resolve(import.meta.dirname, "dist"),
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                index: resolve(import.meta.dirname, "app/html/index.html"),
                welcome: resolve(import.meta.dirname, "app/html/welcome.html"),
                login: resolve(import.meta.dirname, "app/html/login.html"),
            },
        },
    },
});
