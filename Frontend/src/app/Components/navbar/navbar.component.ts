import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../Services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  template: `
    <nav class="gc-navbar">
      <div class="gc-navbar-inner">
        <a class="gc-logo" routerLink="/">
          <span class="gc-logo-icon">CS</span>
          <span class="gc-logo-text">LEAGUE</span>
        </a>

        <ul class="gc-nav-links">
          @if (auth.isLoggedIn) {
            <li><a routerLink="/dashboard" routerLinkActive="active">Início</a></li>
            <li><a routerLink="/create-league" routerLinkActive="active">Ligas</a></li>
            <li><a routerLink="/create-team" routerLinkActive="active">Times</a></li>
            <li><a routerLink="/demo-upload" routerLinkActive="active">Demos</a></li>
            <li><a routerLink="/profile" routerLinkActive="active">Perfil</a></li>
            <li>
              <button class="gc-nav-logout" (click)="logout()">Sair</button>
            </li>
          } @else {
            <li><a routerLink="/login" routerLinkActive="active">Login</a></li>
            <li>
              <a routerLink="/register" routerLinkActive="active" class="gc-nav-cta">Cadastrar</a>
            </li>
          }
        </ul>
      </div>
    </nav>
  `
})
export class NavbarComponent {
  constructor(public auth: AuthService) {}

  logout(): void {
    this.auth.logout();
    window.location.href = '/login';
  }
}
