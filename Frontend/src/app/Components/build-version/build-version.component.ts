import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VersionService } from '../../Services/version.service';

@Component({
  selector: 'app-build-version',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="gc-build-version" [title]="tooltip">
      <span class="gc-build-version-label">Front {{ frontendLabel }}</span>
      <span class="gc-build-version-sep" *ngIf="backendLabel">·</span>
      <span class="gc-build-version-label" *ngIf="backendLabel">API {{ backendLabel }}</span>
    </div>
  `,
})
export class BuildVersionComponent implements OnInit {
  frontendLabel = '';
  backendLabel: string | null = null;
  tooltip = '';

  constructor(private versionService: VersionService) {}

  ngOnInit(): void {
    const front = this.versionService.getFrontendBuild();
    this.frontendLabel = this.versionService.formatLabel(front);
    this.tooltip = `Build ${front.buildTime} · branch ${front.branch}`;

    this.versionService.getAppVersion().subscribe((info) => {
      this.backendLabel = info.backendLabel;
      if (info.backend) {
        this.tooltip = [
          `Front: ${info.frontend.buildTime} (${info.frontend.branch})`,
          `API: ${info.backend.buildTime} (${info.backend.branch})`,
        ].join('\n');
      }
    });
  }
}
