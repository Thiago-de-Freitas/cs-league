import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../Services/auth.service';
import { APP_NAME_PARTS } from '../../Utils/brand';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  template: `
    @if (auth.isLoggedIn && auth.isParticipationBanned()) {
      <div class="gc-ban-banner" role="status">
        Conta suspensa de participar em ligas, partidas e envio de demos
        @if (auth.getBannedUntilLabel(); as until) {
          até {{ until }}.
        }
      </div>
    }
    <nav class="gc-navbar">
      <div class="gc-navbar-inner">
        <a class="gc-logo" routerLink="/" (click)="closeMenu()">
          <span class="gc-logo-icon">{{ brand.icon }}</span>
          <span class="gc-logo-text">{{ brand.primary }} {{ brand.secondary }}</span>
        </a>

        <button
          type="button"
          class="gc-nav-toggle"
          (click)="toggleMenu()"
          [attr.aria-expanded]="menuOpen"
          aria-label="Abrir menu">
          <span class="gc-nav-toggle-bar" [class.is-open]="menuOpen"></span>
          <span class="gc-nav-toggle-bar" [class.is-open]="menuOpen"></span>
          <span class="gc-nav-toggle-bar" [class.is-open]="menuOpen"></span>
        </button>

        <ul class="gc-nav-links" [class.is-open]="menuOpen">
          @if (auth.isLoggedIn) {
            <li><a routerLink="/dashboard" routerLinkActive="active" (click)="closeMenu()">Início</a></li>
            <li><a routerLink="/create-league" routerLinkActive="active" (click)="closeMenu()">Ligas</a></li>
            <li><a routerLink="/create-team" routerLinkActive="active" (click)="closeMenu()">Times</a></li>
            <li><a routerLink="/demos" routerLinkActive="active" (click)="closeMenu()">Demos</a></li>
            <li><a routerLink="/profile" routerLinkActive="active" (click)="closeMenu()">Perfil</a></li>
            @if (auth.isSystemAdmin()) {
              <li><a routerLink="/admin-players" routerLinkActive="active" (click)="closeMenu()">Jogadores</a></li>
              <li><a routerLink="/admin-audit" routerLinkActive="active" (click)="closeMenu()">Auditoria</a></li>
            }
            <li>
              <button class="gc-nav-logout" (click)="logout()">Sair</button>
            </li>
          } @else {
            <li><a routerLink="/login" routerLinkActive="active" (click)="closeMenu()">Login</a></li>
            <li>
              <a routerLink="/register" routerLinkActive="active" class="gc-nav-cta" (click)="closeMenu()">Cadastrar</a>
            </li>
          }
        </ul>
      </div>
    </nav>
  `
})
export class NavbarComponent {
  menuOpen = false;
  readonly brand = APP_NAME_PARTS;

  constructor(public auth: AuthService) {}

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  logout(): void {
    this.closeMenu();
    this.auth.logout();
    window.location.href = '/login';
  }
}
