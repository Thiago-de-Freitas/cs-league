import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VersionService } from '../../Services/version.service';

@Component({
  selector: 'app-build-version',
  standalone: true,
  imports: [CommonModule],
  template: `
    <footer class="gc-app-footer">
      <p class="gc-app-version" [title]="tooltip">
        CS League <span class="gc-app-version-number">{{ systemVersion }}</span>
      </p>
      <p class="gc-app-copyright">
        © {{ currentYear }}
        <a
          href="https://www.punkcodesolution.com.br/"
          target="_blank"
          rel="noopener noreferrer">
          Punk Code Solution
        </a>
      </p>
    </footer>
  `,
})
export class BuildVersionComponent implements OnInit {
  systemVersion = '';
  tooltip = '';
  currentYear = new Date().getFullYear();

  constructor(private versionService: VersionService) {}

  ngOnInit(): void {
    this.systemVersion = this.versionService.getSystemVersionLabel();
    this.tooltip = this.versionService.getSystemVersionTooltip();
  }
}
