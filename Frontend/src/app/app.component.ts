import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './Components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  template: `
    <app-navbar></app-navbar>
    <main class="main-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: '',
  imports: [RouterModule, NavbarComponent]
})
export class AppComponent {
  title = 'cs2-platform-frontend';
}
