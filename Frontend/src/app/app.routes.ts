import { Routes } from '@angular/router';
import { DashboardComponent } from './Pages/dashboard/dashboard.component';
import { LoginComponent } from './Pages/login/login.component';
import { RegisterComponent } from './Pages/register/register.component';
import { CreateLeagueComponent } from './Pages/create-league/create-league.component';
import { ProfileComponent } from './Pages/profile/profile.component';
import { CreateTeamComponent } from './Pages/create-team/create-team.component';
import { LeagueDetailsComponent } from './Pages/league-details/league-details.component';
import { TeamDetailsComponent } from './Pages/team-details/team-details.component';
import { DemoUploadComponent } from './Pages/demo-upload/demo-upload.component';
import { MatchDetailsComponent } from './Pages/match-details/match-details.component';
import { authGuard } from './Guards/auth.guard';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'create-league', component: CreateLeagueComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'create-team', component: CreateTeamComponent, canActivate: [authGuard] },
  { path: 'league-details/:id', component: LeagueDetailsComponent, canActivate: [authGuard] },
  { path: 'team-details/:id', component: TeamDetailsComponent, canActivate: [authGuard] },
  { path: 'demo-upload', component: DemoUploadComponent, canActivate: [authGuard] },
  { path: 'match/:id', component: MatchDetailsComponent, canActivate: [authGuard] },
  { path: 'demo/:id', component: MatchDetailsComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
