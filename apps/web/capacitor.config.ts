/**
 * Capacitor wrapper config — run `npx cap init` / add platforms when packaging.
 * `webDir` must match Vite `outDir` (`dist`). Keep using the same React routes and
 * `import.meta.env.BASE_URL` for asset paths; no frontend rewrite required.
 */
const config = {
  appId: "com.inclusivetourism.app",
  appName: "Tasfiri",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
