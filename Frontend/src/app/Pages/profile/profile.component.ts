import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../Services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  userName = '';
  email = '';
  steamId = '';
  role = '';
  successMsg = '';
  errorMsg = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.profileForm = this.fb.group({
      displayName: ['', Validators.required],
      steamId: [''],
    });
  }

  ngOnInit(): void {
    this.authService.getMe().subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.email = user.email;
        this.steamId = user.steamId || '';
        this.role = user.role;
        this.profileForm.patchValue({
          displayName: user.displayName,
          steamId: user.steamId || '',
        });
      },
      error: () => {
        this.errorMsg = 'Erro ao carregar perfil.';
      }
    });
  }

  onUpdateProfile(): void {
    if (!this.profileForm.valid) return;

    this.authService.updateProfile(this.profileForm.value).subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.steamId = user.steamId || '';
        this.successMsg = 'Perfil atualizado com sucesso!';
        this.errorMsg = '';
      },
      error: (err) => {
        this.errorMsg = err.error?.error || 'Erro ao atualizar perfil.';
      }
    });
  }

  connectSteam(): void {
    alert('Login via Steam será implementado em fase futura. Edite o Steam ID manualmente abaixo.');
  }
}
