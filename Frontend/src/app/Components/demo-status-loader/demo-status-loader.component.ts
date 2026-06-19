import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-demo-status-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="demo-status-loader" [class.compact]="compact" [class.block]="block" role="status" aria-live="polite">
      <span class="demo-spinner" aria-hidden="true"></span>
      <span class="demo-status-text">{{ displayMessage }}</span>
    </div>
  `,
  styleUrls: ['./demo-status-loader.component.css']
})
export class DemoStatusLoaderComponent {
  @Input() status: string = 'pending';
  @Input() compact = false;
  @Input() block = false;
  @Input() message = '';

  get displayMessage(): string {
    if (this.message) return this.message;
    return this.status === 'processing' ? 'Processando demo...' : 'Aguardando análise...';
  }
}
