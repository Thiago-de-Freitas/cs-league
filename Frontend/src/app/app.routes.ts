import { Routes } from '@angular/router';
import { LoginComponent } from './Pages/login/login.component';
import { RegisterComponent } from './Pages/register/register.component';
import { PlayerProfileComponent } from './Pages/player-profile/player-profile.component';
import { authGuard } from './Guards/auth.guard';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./Pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: 'create-league',
    loadComponent: () =>
      import('./Pages/create-league/create-league.component').then((m) => m.CreateLeagueComponent),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./Pages/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'users/:id',
    loadComponent: () =>
      import('./Pages/user-profile/user-profile.component').then((m) => m.UserProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'create-team',
    loadComponent: () =>
      import('./Pages/create-team/create-team.component').then((m) => m.CreateTeamComponent),
    canActivate: [authGuard],
  },
  {
    path: 'league-details/:id',
    loadComponent: () =>
      import('./Pages/league-details/league-details.component').then((m) => m.LeagueDetailsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'team-details/:id',
    loadComponent: () =>
      import('./Pages/team-details/team-details.component').then((m) => m.TeamDetailsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'demo-upload',
    loadComponent: () =>
      import('./Pages/demo-upload/demo-upload.component').then((m) => m.DemoUploadComponent),
    canActivate: [authGuard],
  },
  {
    path: 'match/:id',
    loadComponent: () =>
      import('./Pages/match-details/match-details.component').then((m) => m.MatchDetailsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin-players',
    loadComponent: () =>
      import('./Pages/admin-players/admin-players.component').then((m) => m.AdminPlayersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin-audit',
    loadComponent: () =>
      import('./Pages/admin-audit/admin-audit.component').then((m) => m.AdminAuditComponent),
    canActivate: [authGuard],
  },
  { path: 'player/:steamId', component: PlayerProfileComponent, canActivate: [authGuard] },
  {
    path: 'demo/:id',
    loadComponent: () =>
      import('./Pages/match-details/match-details.component').then((m) => m.MatchDetailsComponent),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
