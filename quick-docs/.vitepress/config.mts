import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Quick Portal Docs",
  description:
    "Documentação e specs do Quick Portal: modelos e integração com a OWN.",
  srcExclude: ["README.md"],
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "OWN", link: "/own/" },
      { text: "Models", link: "/models/" },
    ],
    sidebar: [
      {
        text: "Cielo",
        link: "/cielo/",
        items: [
          { text: "Seller Onboarding", link: "/cielo/seller-onboarding" },
          { text: "Onboarding Status", link: "/cielo/onboarding-status" },
          { text: "Plans", link: "/cielo/plans" },
          { text: "Transactions", link: "/cielo/transactions" },
        ],
      },
      {
        text: "OWN",
        link: "/own/",
        items: [
          { text: "Business Signup", link: "/own/business-signup" },
          { text: "Cestas", link: "/own/cestas" },
          { text: "Plans", link: "/own/planos" },
        ],
      },
      {
        text: "Models",
        link: "/models/",
        items: [
          { text: "Business", link: "/models/business" },
          { text: "OwnFee and related models", link: "/models/own-fee" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/Gabriel5934/quick-portal-web",
      },
    ],
  },
});
