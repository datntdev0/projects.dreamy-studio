import { Routes } from '@angular/router';

import { homeGuard } from './features/workspace/workspace.guard';
import { MainPage } from './pages/main/main.page';
import { SplashPage } from './pages/splash/splash.page';

export const routes: Routes = [
  { path: '', component: SplashPage, pathMatch: 'full' },
  { path: 'home', component: MainPage, canActivate: [homeGuard] },
];
