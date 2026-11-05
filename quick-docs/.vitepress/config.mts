import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "Quick Monorepo Docs",
  description:
    "Documentação e specs do Quick Portal: modelos e integração com a OWN.",
  srcExclude: ["README.md"],
  themeConfig: {
    nav: [{ text: "Home", link: "/" }],
    sidebar: [
      {
        text: "Quick API",
        link: "/quick-api/",
        items: [
          { text: "Auth", link: "/quick-api/auth" },
          { text: "Cielo Auth", link: "/quick-api/cielo-auth" },
          { text: "Cielo Seller Onboarding", link: "/quick-api/onboarding" },
        ],
      },
      {
        text: "Beacon",
        link: "/beacon/",
        items: [
          { text: "Notifications", link: "/beacon/notifications" },
          { text: "Cielo Auth", link: "/beacon/cielo-auth" },
          { text: "List of Cielo Banks", link: "/beacon/cielo-banks" },
        ],
      },
      {
        text: "Cielo",
        link: "/cielo/",
        items: [
          { text: "Auth Token", link: "/cielo/auth-token" },
          { text: "Seller Onboarding", link: "/cielo/seller-onboarding" },
          { text: "Notifications", link: "/cielo/notifications" },
          { text: "Split", link: "/cielo/split" },
          { text: "Transaction Lookup", link: "/cielo/transaction-lookup" },
          { text: "List of Banks", link: "/cielo/banks" },
          {
            text: "List of Business Activites",
            link: "/cielo/business-activities",
          },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/Gabriel5934/quick-portal",
      },
    ],
  },
  vite: {
    plugins: [llmstxt()],
  },
});
