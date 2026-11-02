import {defineConfig} from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
    root: './client',
    envDir: '..',
    server: {
        fs: {
            allow: [
                fileURLToPath(new URL('./client', import.meta.url)),
                fileURLToPath(new URL('./node_modules', import.meta.url))
            ]
        }
    }
});
