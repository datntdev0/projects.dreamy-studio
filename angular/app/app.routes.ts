import { Routes } from "@angular/router";
import { homeGuard } from "./core/workspace/workspace.guard";
import { loadingGuard } from "./core/workspace/workspace.guard";
import { LoadingPage } from "./pages/loading/loading.page";
import { MainPage } from "./pages/main/main.page";
import { SplashPage } from "./pages/splash/splash.page";

export const routes: Routes = [
  { path: "", component: SplashPage, pathMatch: "full" },
  { path: "loading", component: LoadingPage, canActivate: [loadingGuard] },
  { path: "home", component: MainPage, canActivate: [homeGuard] },
];
