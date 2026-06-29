import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { APP_NAME } from './app/Utils/brand';

function showBootstrapError(message: string): void {
  const root = document.querySelector('app-root') || document.body;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:#0a0a0a;color:#f0f0f0;font-family:Inter,system-ui,sans-serif;">
      <div style="max-width:32rem;text-align:center;">
        <h1 style="color:#ff5500;margin-bottom:1rem;font-size:1.5rem;">Falha ao carregar o ${APP_NAME}</h1>
        <p style="color:#a0a0a0;margin-bottom:1rem;">${message}</p>
        <button type="button" onclick="location.reload()" style="background:#ff5500;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:8px;cursor:pointer;font-weight:600;">
          Tentar novamente
        </button>
      </div>
    </div>
  `;
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  console.error('[bootstrap]', err);
  showBootstrapError(
    'Não foi possível iniciar a aplicação. Tente recarregar a página ou limpar o cache do navegador.'
  );
});
