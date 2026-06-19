import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './Components/navbar/navbar.component';
import { NotificationHostComponent } from './Components/notification-host/notification-host.component';
import { AuthService } from './Services/auth.service';

@Component({
  selector: 'app-root',
  template: `
    <app-navbar></app-navbar>
    <main class="main-content">
      <router-outlet></router-outlet>
    </main>
    <app-notification-host></app-notification-host>
  `,
  styles: '',
  imports: [RouterModule, NavbarComponent, NotificationHostComponent]
})
export class AppComponent implements OnInit {
  title = 'cs2-platform-frontend';

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    if (this.authService.isLoggedIn) {
      this.authService.getMe().subscribe({ error: () => this.authService.logout() });
    }
  }
}
