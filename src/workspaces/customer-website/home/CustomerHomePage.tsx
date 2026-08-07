import { HomeActionCards } from "@/workspaces/customer-website/home/HomeActionCards";
import { HomeHero } from "@/workspaces/customer-website/home/HomeHero";

export function CustomerHomePage() {
  return (
    <main className="bg-mist min-h-dvh">
      <HomeHero />
      <HomeActionCards />
    </main>
  );
}
