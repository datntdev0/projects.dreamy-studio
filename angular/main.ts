import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './root.component';
import { appConfig } from './root.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
